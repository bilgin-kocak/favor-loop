#!/usr/bin/env bun
// Builds the files for the Edge-City/agentvillage pull request under agentvillage/:
//   mini-apps/favorloop/manifest.json   operations from src/schemas.ts, the skill pinned by sha256
//   mini-apps/favorloop/README.md       the contract, from scripts/templates/README.md
//   skills/favorloop/SKILL.md           committed by hand, never generated (its bytes are pinned)
//   scripts/tests/fixtures/favorloop/<operation>/<name>.json   real answers from the real tools, in memory
//
//   bun scripts/agentvillage.ts --host https://favorloop.fly.dev
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../src/db";
import type { Ctx } from "../src/core";
import { PROPOSAL_TTL_MS } from "../src/core";
import { makeIdentity } from "../src/identity";
import { handleMcp, type McpDeps } from "../src/mcp";
import { RateLimiter } from "../src/ratelimit";
import { OPERATIONS } from "../src/schemas";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "agentvillage");
const SKILL_PATH = "skills/favorloop/SKILL.md";

const flag = process.argv.indexOf("--host");
const host = (flag > 0 ? process.argv[flag + 1] : process.env.PUBLIC_BASE_URL?.startsWith("https://") ? process.env.PUBLIC_BASE_URL : "https://favorloop.fly.dev")!
  .replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
  console.error(`--host must be a lower-case https origin with no port or path, like https://favorloop.fly.dev (got ${host})`);
  process.exit(2);
}

const write = (path: string, text: string) => {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), text);
};
const canonical = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// ---------------------------------------------------------------------------------------- manifest
const skillBytes = readFileSync(join(OUT, SKILL_PATH));
const manifest = {
  manifest: 2,
  id: "favorloop",
  name: "Favor Loop",
  version: "1.0.0",
  description: "Favor Loop at Edge City India finds loops of 15-minute favors between residents (A helps B, B helps C, C helps A) when no two of them could swap directly, plus simple swaps and gift chains. Read how it works, the favor menu and the anonymous board; and, only when the owner asks in their private chat, join with their offers and wants, see their proposed loops, say yes or no, confirm a favor they received, or leave.",
  homepage: `${host}/`,
  owner: { github: "bilgin-kocak" },
  visibility: "sandbox",
  permissions: [
    { kind: "read", label: "Public Favor Loop info", description: "How Favor Loop works, the favor menu and an anonymous board of loops and counts. No names or private data." },
    { kind: "read", label: "Your own loops", description: "Your chosen favors and the loops proposed to you. Agent Village tells Favor Loop which resident you are by a private, stable reference, never your Telegram id or username." },
    { kind: "action", label: "Join, answer, confirm and leave, when you ask", description: "Sends your chosen favor ids, an optional Telegram handle that is shown only to people in a loop you accepted, your yes or no to a proposed loop, your confirmation that you received a favor, or a request to delete everything Favor Loop holds about you. No data goes to any third party." },
  ],
  service: { kind: "mcp", baseUrl: `${host}/mcp`, auth: { mode: "app-token", secretRef: "MINI_APP_FAVORLOOP_KEY" } },
  operations: OPERATIONS.map(op => ({
    name: op.name,
    class: op.class,
    target: { tool: op.tool },
    input: op.input,
    maxRequestBytes: 4096,
    maxResponseBytes: 32768,
    timeoutMs: 25000,
    framing: "data",
  })),
  skills: [{ name: "favorloop", version: "1.0.0", sha256: createHash("sha256").update(skillBytes).digest("hex"), path: SKILL_PATH }],
};
write("mini-apps/favorloop/manifest.json", canonical(manifest));

// ---------------------------------------------------------------------------------------- README
const template = readFileSync(join(ROOT, "scripts/templates/README.md"), "utf8");
write("mini-apps/favorloop/README.md", template.replaceAll("{{HOST}}", host.replace("https://", "")));

// ---------------------------------------------------------------------------------------- fixtures
const KEY = "fixture-key";
let clock = Date.parse("2026-10-29T18:00:00+05:30");
let ids = 0;
const ctx: Ctx = {
  db: openDb(":memory:"),
  now: () => clock,
  newId: () => `0f0f0f0f-0000-4000-8000-${(++ids).toString(16).padStart(12, "0")}`,
  emit: () => {},
  simulated: false,
  closesAt: Date.parse("2026-11-30T00:00:00+05:30"),
};
const deps: McpDeps = { ctx, identity: makeIdentity("fixtures"), appKey: KEY, publicBaseUrl: host };

async function call(tool: string, args: unknown, subject?: string, over: Partial<McpDeps> = {}): Promise<any> {
  const res = await handleMcp(new Request(`${host}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(subject ? { authorization: `Bearer ${KEY}`, "x-village-subject": subject } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  }), "198.51.100.1", { ...deps, ...over });
  return ((await res.json()) as { result: any }).result;
}

const FIXTURES = "scripts/tests/fixtures/favorloop";
rmSync(join(OUT, FIXTURES), { recursive: true, force: true });
const op = (tool: string) => OPERATIONS.find(o => o.tool === tool)!.name;
const save = (tool: string, name: string, result: any, request?: unknown) => {
  const body = name.startsWith("error") ? result.structuredContent : result;
  if (name.startsWith("error") !== (result.isError === true)) throw new Error(`${tool}/${name}: expected ${name.startsWith("error") ? "an error" : "a success"}`);
  if (name.startsWith("error") && Object.keys(body).join() !== "code,detail") throw new Error(`${tool}/${name}: not {code, detail}`);
  write(`${FIXTURES}/${op(tool)}/${name}.json`, canonical(body));
  if (request !== undefined) write(`${FIXTURES}/${op(tool)}/${name}.request.json`, canonical(request));
};
const denyAll = { ipLimiter: new RateLimiter(0, 60_000), memberLimiter: new RateLimiter(0, 60_000) };
const broken = (): Partial<McpDeps> => {
  const db = openDb(":memory:");
  db.close();
  return { ctx: { ...ctx, db } };
};
const [A, B, C, G, X, Y] = ["fixture-resident-a", "fixture-resident-b", "fixture-resident-c", "fixture-giver", "fixture-resident-x", "fixture-resident-y"];

// The public reads (each with the request a live check would send).
for (const tool of ["how_it_works", "menu"]) {
  save(tool, "success", await call(tool, {}), {});
  save(tool, "error-invalid-arguments", await call(tool, { limit: 5 }), { limit: 5 });
  save(tool, "error-rate-limited", await call(tool, {}, undefined, denyAll));
}

// The spec's three residents: no two could swap, the three of them loop.
save("join", "success", await call("join", { offers: ["code_review"], wants: ["portrait_photo"], giftOnly: false, contactHandle: "@fixture_alice", availability: ["fri_morning", "sat"] }, A));
await call("join", { offers: ["portrait_photo"], wants: ["stretch_session"], contactHandle: "fixture_bob", availability: ["sat"] }, B);
save("join", "success-loop-proposed", await call("join", { offers: ["stretch_session"], wants: ["code_review"] }, C));
save("join", "error-invalid-arguments", await call("join", { offers: ["code_review"], wants: ["code_review"] }, A));
save("join", "error-not-authorized", await call("join", { offers: ["code_review"], wants: ["portrait_photo"] }));
save("join", "error-rate-limited", await call("join", { offers: ["code_review"], wants: ["portrait_photo"] }, A, denyAll));
save("join", "error-unavailable", await call("join", { offers: ["code_review"], wants: ["portrait_photo"] }, A, broken()));

const loopId: string = (await call("my_loops", {}, A)).structuredContent.loops[0].loopId;
save("my_loops", "success", await call("my_loops", {}, A));
save("my_loops", "success-not-joined", await call("my_loops", {}, "fixture-newcomer"));
save("my_loops", "error-invalid-arguments", await call("my_loops", { residentId: "123" }, A));
save("my_loops", "error-not-authorized", await call("my_loops", {}));
save("my_loops", "error-rate-limited", await call("my_loops", {}, A, denyAll));
save("my_loops", "error-unavailable", await call("my_loops", {}, A, broken()));

save("confirm", "error-conflict", await call("confirm", { loopId, received: true }, A)); // nobody said yes yet
save("answer", "success", await call("answer", { loopId, decision: "yes" }, A));
await call("answer", { loopId, decision: "yes" }, B);
save("answer", "success-accepted", await call("answer", { loopId, decision: "yes" }, C));
save("my_loops", "success-accepted", await call("my_loops", {}, B));
save("answer", "error-invalid-arguments", await call("answer", { loopId, decision: "maybe" }, A));
save("answer", "error-not-authorized", await call("answer", { loopId, decision: "yes" }));
save("answer", "error-not-found", await call("answer", { loopId: "0f0f0f0f-0000-4000-8000-0000000000ff", decision: "yes" }, A));
save("answer", "error-conflict", await call("answer", { loopId, decision: "no" }, A)); // already accepted
save("answer", "error-rate-limited", await call("answer", { loopId, decision: "yes" }, A, denyAll));
save("answer", "error-unavailable", await call("answer", { loopId, decision: "yes" }, A, broken()));

save("confirm", "success", await call("confirm", { loopId, received: true }, A));
await call("confirm", { loopId, received: true }, B);
save("confirm", "success-completed", await call("confirm", { loopId, received: true }, C));
save("confirm", "error-invalid-arguments", await call("confirm", { loopId }, A));
save("confirm", "error-not-found", await call("confirm", { loopId: "0f0f0f0f-0000-4000-8000-0000000000ff", received: true }, A));
save("confirm", "error-rate-limited", await call("confirm", { loopId, received: true }, A, denyAll));
save("confirm", "error-unavailable", await call("confirm", { loopId, received: true }, A, broken()));

// A gift chain: G only gives, so G cannot confirm anything.
await call("join", { offers: ["goa_tips"], giftOnly: true }, G);
await call("join", { offers: ["music_lesson"], wants: ["ai_tool_setup"] }, Y);
await call("join", { offers: ["ai_tool_setup"], wants: ["goa_tips"] }, X);
const chainId: string = (await call("my_loops", {}, G)).structuredContent.loops[0].loopId;
for (const who of [G, X, Y]) await call("answer", { loopId: chainId, decision: "yes" }, who);
save("confirm", "error-not-authorized", await call("confirm", { loopId: chainId, received: true }, G));

// A proposal nobody answers in time.
await call("join", { offers: ["cv_review"], wants: ["design_feedback"] }, "fixture-resident-d");
await call("join", { offers: ["design_feedback"], wants: ["cv_review"] }, "fixture-resident-e");
const swapId: string = (await call("my_loops", {}, "fixture-resident-d")).structuredContent.loops[0].loopId;
clock += PROPOSAL_TTL_MS + 60_000;
save("answer", "error-expired", await call("answer", { loopId: swapId, decision: "yes" }, "fixture-resident-d"));

save("board", "success", await call("board", { limit: 5 }), { limit: 5 });
save("board", "error-invalid-arguments", await call("board", { limit: 50 }), { limit: 50 });
save("board", "error-rate-limited", await call("board", {}, undefined, denyAll));
save("board", "error-unavailable", await call("board", {}, undefined, broken()));

save("leave", "success", await call("leave", {}, A));
save("leave", "error-invalid-arguments", await call("leave", { userId: "123" }, A));
save("leave", "error-not-authorized", await call("leave", {}));
save("leave", "error-rate-limited", await call("leave", {}, B, denyAll));
save("leave", "error-unavailable", await call("leave", {}, B, broken()));

console.log(`Wrote agentvillage/ for ${host}: manifest (skill sha256 ${manifest.skills[0].sha256.slice(0, 12)}...), README and fixtures.`);
