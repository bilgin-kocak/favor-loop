#!/usr/bin/env bun
// End-to-end check of a running Favor Loop MCP endpoint against the generated manifest and fixtures: the
// protocol, tools/list equal to the manifest inputs, public reads, auth refusals, input validation, a full
// three-way loop (join, yes, confirm, leave), each operation's time and size budget, and the live answers'
// fields against the fixtures. Private calls use FAVORLOOP_TEST_KEY: set it to the server's FAVORLOOP_DEMO_KEY
// so the three throwaway test accounts live in the isolated test village and leave at the end.
//
//   FAVORLOOP_MCP_URL=https://favorloop.fly.dev/mcp FAVORLOOP_TEST_KEY=... bun scripts/live-check.ts
//
// FAVORLOOP_MCP_URL defaults to http://localhost:8080/mcp. Exits 1 if any check fails.
import { join } from "node:path";

type Op = { name: string; class: string; target: { tool: string }; input: unknown; timeoutMs: number; maxResponseBytes: number };
type Answer = { status: number; ms: number; bytes: number; body: any };

const ENDPOINT = process.env.FAVORLOOP_MCP_URL || "http://localhost:8080/mcp";
const KEY = process.env.FAVORLOOP_TEST_KEY ?? "";
const AV = join(import.meta.dir, "..", "agentvillage");
const FIXTURES = join(AV, "scripts/tests/fixtures/favorloop");
const ops: Op[] = (await Bun.file(join(AV, "mini-apps/favorloop/manifest.json")).json()).operations;
const opByTool = new Map(ops.map(o => [o.target.tool, o]));
const CODES = new Set(["invalid_arguments", "not_found", "not_connected", "reconnect_required", "not_authorized", "rate_limited", "conflict", "expired", "in_progress", "unavailable"]);
if (!KEY) console.log("FAVORLOOP_TEST_KEY is not set: every private call will be refused and those checks fail.");

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`);
};
const budget = new Map<string, { ms: number; bytes: number; calls: number }>();
const liveSuccess = new Map<string, Record<string, unknown>>();

type As = { token?: string; subject?: string };
async function rpc(method: string, params: unknown, as: As = {}, id: number | null = 1): Promise<Answer> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
  if (as.token) headers.authorization = `Bearer ${as.token}`;
  if (as.subject) headers["x-village-subject"] = as.subject;
  const started = performance.now();
  const res = await fetch(ENDPOINT, { method: "POST", redirect: "error", headers, body: JSON.stringify({ jsonrpc: "2.0", method, params, ...(id === null ? {} : { id }) }) });
  const text = await res.text();
  return { status: res.status, ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(text), body: text ? JSON.parse(text) : null };
}

async function tool(name: string, args: Record<string, unknown>, as: As = {}) {
  const answer = await rpc("tools/call", { name, arguments: args }, as);
  const result = answer.body?.result;
  const sc = result?.structuredContent;
  const seen = budget.get(name) ?? { ms: 0, bytes: 0, calls: 0 };
  budget.set(name, { ms: Math.max(seen.ms, answer.ms), bytes: Math.max(seen.bytes, answer.bytes), calls: seen.calls + 1 });
  const isError = !!result?.isError;
  if (isError && (Object.keys(sc ?? {}).sort().join(",") !== "code,detail" || !CODES.has(sc.code))) check(`${name} error body is exactly {code, detail} with a closed code`, false, JSON.stringify(sc));
  if (!isError && sc && !liveSuccess.has(name)) liveSuccess.set(name, sc);
  if (result && result.content?.[0]?.type !== "text") check(`${name} answers with a text content block`, false);
  return { ...answer, sc, isError, code: isError ? (sc?.code as string) : undefined };
}

console.log(`== protocol (${ENDPOINT})`);
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "live-check", version: "0" } });
check("initialize answers 200 with protocol 2025-06-18", init.status === 200 && init.body?.result?.protocolVersion === "2025-06-18", `${init.ms} ms`);
const note = await rpc("notifications/initialized", {}, {}, null);
check("notifications/initialized is accepted", note.status >= 200 && note.status < 300, `HTTP ${note.status}`);
const tools: { name: string; inputSchema: unknown }[] = (await rpc("tools/list", {})).body?.result?.tools ?? [];
check("tools/list names exactly the manifest's tools", JSON.stringify(tools.map(t => t.name).sort()) === JSON.stringify([...opByTool.keys()].sort()), tools.map(t => t.name).join(" "));
for (const t of tools) check(`tools/list ${t.name} inputSchema equals the manifest input`, Bun.deepEquals(t.inputSchema, opByTool.get(t.name)?.input));
const get = await fetch(ENDPOINT, { method: "GET", redirect: "manual" });
check("GET does not redirect", get.status < 300 || get.status >= 400, `HTTP ${get.status}`);

console.log("== public reads, no token");
check("how_it_works", !(await tool("how_it_works", {})).isError);
check("menu", !(await tool("menu", {})).isError);
check("board {limit: 5}", !(await tool("board", { limit: 5 })).isError);
check("board {limit: 50} is invalid_arguments", (await tool("board", { limit: 50 })).code === "invalid_arguments");

console.log("== auth");
check("my_loops without a token is not_authorized", (await tool("my_loops", {})).code === "not_authorized");
check("my_loops with a wrong token is not_authorized", (await tool("my_loops", {}, { token: "wrong", subject: "x" })).code === "not_authorized");
const noSubject = await tool("my_loops", {}, { token: KEY });
check("my_loops with the key but no subject is refused", noSubject.isError, noSubject.code);

const run = crypto.randomUUID().slice(0, 8);
const [A, B, C] = ["a", "b", "c"].map(x => `live-check-${run}-${x}`) as [string, string, string];
const as = (subject: string): As => ({ token: KEY, subject });
const letter = (subject: string) => subject.slice(-1).toUpperCase();

console.log("== validation");
check("join with an identity key (userId) is invalid_arguments", (await tool("join", { offers: ["code_review"], userId: "x" }, as(A))).code === "invalid_arguments");
check("join with an unknown favor is invalid_arguments", (await tool("join", { offers: ["not_a_favor"] }, as(A))).code === "invalid_arguments");
check("join with no offers is invalid_arguments", (await tool("join", { wants: ["code_review"] }, as(A))).code === "invalid_arguments");
check("answer on an unknown loop is not_found", (await tool("answer", { loopId: crypto.randomUUID(), decision: "yes" }, as(A))).code === "not_found");

console.log("== a three-way loop between three test accounts");
check("B joins (portrait, wants stretching)", !(await tool("join", { offers: ["portrait_photo"], wants: ["stretch_session"], availability: ["fri_morning"] }, as(B))).isError);
check("C joins (stretching, wants code review)", !(await tool("join", { offers: ["stretch_session"], wants: ["code_review"], availability: ["fri_morning"] }, as(C))).isError);
const joinA = await tool("join", { offers: ["code_review"], wants: ["portrait_photo"], availability: ["fri_morning"] }, as(A));
check("A joins (code review, wants portrait) and a loop is proposed", !joinA.isError && joinA.sc?.newProposal === true, joinA.sc?.text);
const loopOf = async (subject: string) => ((await tool("my_loops", {}, as(subject))).sc?.loops ?? [])[0] as { loopId: string; status: string } | undefined;
const [la, lb, lc] = [await loopOf(A), await loopOf(B), await loopOf(C)];
check("all three see the same proposed loop", !!la && la.loopId === lb?.loopId && la.loopId === lc?.loopId && la.status === "proposed", `${la?.loopId} ${la?.status}`);
const loopId = la?.loopId;
for (const s of [A, B]) check(`${letter(s)} says yes`, !(await tool("answer", { loopId, decision: "yes" }, as(s))).isError);
check("confirm before everyone said yes is refused", (await tool("confirm", { loopId, received: true }, as(A))).isError);
const lastYes = await tool("answer", { loopId, decision: "yes" }, as(C));
check("C says yes and the loop is accepted", !lastYes.isError && (await loopOf(A))?.status === "accepted", lastYes.sc?.text);
for (const s of [A, B, C]) check(`${letter(s)} confirms the favor received`, !(await tool("confirm", { loopId, received: true }, as(s))).isError);
const finalStatus = (await loopOf(B))?.status;
check("the loop is completed", finalStatus === "completed", finalStatus);

console.log("== cleanup");
for (const s of [A, B, C]) check(`${letter(s)} leaves`, !(await tool("leave", {}, as(s))).isError);
check("after leave, my_loops says not joined", (await tool("my_loops", {}, as(A))).sc?.joined === false);

console.log("== budgets (the slowest and largest answer of each operation) against the manifest");
for (const [name, seen] of budget) {
  const op = opByTool.get(name)!;
  check(`${name}: ${seen.calls} calls, max ${seen.ms} ms / ${seen.bytes} B`, seen.ms <= op.timeoutMs && seen.bytes <= op.maxResponseBytes, `limits ${op.timeoutMs} ms / ${op.maxResponseBytes} B`);
}

console.log("== live answers against the fixtures (top-level fields)");
for (const [name, sc] of liveSuccess) {
  const file = Bun.file(join(FIXTURES, opByTool.get(name)!.name, "success.json"));
  if (!(await file.exists())) continue;
  const fixture = (await file.json()).structuredContent ?? {};
  const [live, fixed] = [Object.keys(sc).sort().join(","), Object.keys(fixture).sort().join(",")];
  check(`${name} live fields match success.json`, live === fixed, live === fixed ? live : `live ${live} | fixture ${fixed}`);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
