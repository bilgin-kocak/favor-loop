import { describe, expect, test } from "bun:test";
import * as core from "../src/core";
import { makeIdentity } from "../src/identity";
import { handleMcp, MAX_RESPONSE_BYTES, PROTOCOL_VERSION, type McpDeps } from "../src/mcp";
import { RateLimiter } from "../src/ratelimit";
import { OPERATIONS } from "../src/schemas";
import { testCtx } from "./helpers";

const KEY = "test-app-key-not-a-secret";
const BASE = "https://favorloop.example.org";

function setup(extra: Partial<McpDeps> = {}) {
  const t = testCtx();
  const deps: McpDeps = { ctx: t.ctx, identity: makeIdentity("test-salt"), appKey: KEY, publicBaseUrl: BASE, ...extra };
  return { ...t, deps };
}

async function post(deps: McpDeps, body: unknown, headers: Record<string, string> = {}) {
  const res = await handleMcp(new Request(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), "203.0.113.7", deps);
  const raw = await res.text();
  return { status: res.status, raw, body: raw ? JSON.parse(raw) : null, type: res.headers.get("content-type") };
}
const rpc = (deps: McpDeps, method: string, params?: unknown, headers?: Record<string, string>) =>
  post(deps, { jsonrpc: "2.0", id: 7, method, ...(params === undefined ? {} : { params }) }, headers);
const call = async (deps: McpDeps, name: string, args?: unknown, headers?: Record<string, string>) =>
  (await rpc(deps, "tools/call", { name, ...(args === undefined ? {} : { arguments: args }) }, headers)).body.result;
const as = (subject: string) => ({ authorization: `Bearer ${KEY}`, "x-village-subject": subject });

describe("protocol", () => {
  test("initialize answers 2025-06-18 with tools capability and server info", async () => {
    const { deps } = setup();
    const r = await rpc(deps, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(r.status).toBe(200);
    expect(r.type).toBe("application/json");
    expect(r.body.id).toBe(7);
    expect(r.body.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(r.body.result.capabilities).toEqual({ tools: {} });
    expect(r.body.result.serverInfo).toEqual({ name: "favorloop", version: "1.0.0" });
    expect(typeof r.body.result.instructions).toBe("string");
  });

  test("initialize needs no token (public reads go without one)", async () => {
    const { deps } = setup();
    expect((await rpc(deps, "initialize", {})).status).toBe(200);
  });

  test("notifications get 202 with an empty body", async () => {
    const { deps } = setup();
    const r = await post(deps, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(r.status).toBe(202);
    expect(r.raw).toBe("");
  });

  test("ping, unknown methods and unknown tools", async () => {
    const { deps } = setup();
    expect((await rpc(deps, "ping")).body.result).toEqual({});
    const unknown = await rpc(deps, "resources/list");
    expect(unknown.status).toBe(200);
    expect(unknown.body.error.code).toBe(-32601);
    expect((await rpc(deps, "tools/call", { name: "transfer_money", arguments: {} })).body.error.code).toBe(-32602);
  });

  test("tools/list serves each manifest input byte for byte", async () => {
    const { deps } = setup();
    const { tools } = (await rpc(deps, "tools/list")).body.result;
    expect(tools.map((t: any) => t.name)).toEqual(OPERATIONS.map(op => op.tool));
    for (const op of OPERATIONS) {
      const tool = tools.find((t: any) => t.name === op.tool);
      expect(JSON.stringify(tool.inputSchema)).toBe(JSON.stringify(op.input));
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  test("malformed bodies, batches and other methods", async () => {
    const { deps } = setup();
    expect((await post(deps, "{not json")).body.error.code).toBe(-32700);
    expect((await post(deps, [{ jsonrpc: "2.0", id: 1, method: "ping" }])).status).toBe(400);
    expect((await post(deps, { id: 1, method: "ping" })).status).toBe(400);
    const res = await handleMcp(new Request(`${BASE}/mcp`), "203.0.113.7", deps);
    expect(res.status).toBe(405);
  });
});

describe("tools", () => {
  test("a success carries the JSON then a Source line, and structuredContent starts with text", async () => {
    const { deps } = setup();
    const result = await call(deps, "menu", {});
    expect(Object.keys(result.structuredContent)[0]).toBe("text");
    expect(result.content).toEqual([{ type: "text", text: `${JSON.stringify(result.structuredContent)}\nSource: ${BASE}/board` }]);
    expect(result.structuredContent.favors).toHaveLength(12);
    expect(result.isError).toBeUndefined();
  });

  test("public tools work without a token or subject; arguments may be omitted", async () => {
    const { deps } = setup();
    expect((await call(deps, "how_it_works")).structuredContent.steps.length).toBeGreaterThan(3);
    expect((await call(deps, "board", { limit: 5 })).structuredContent.counts.members).toBe(0);
  });

  test("an error is isError with exactly {code, detail}", async () => {
    const { deps } = setup();
    const result = await call(deps, "board", { limit: 50 });
    expect(result.isError).toBe(true);
    expect(Object.keys(result.structuredContent).sort()).toEqual(["code", "detail"]);
    expect(result.structuredContent.code).toBe("invalid_arguments");
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(result.structuredContent) }]);
  });

  test("private tools need the key and a subject of at most 200 characters", async () => {
    const { deps } = setup();
    const codeOf = async (headers: Record<string, string>) => (await call(deps, "my_loops", {}, headers)).structuredContent.code;
    expect(await codeOf({})).toBe("not_authorized");
    expect(await codeOf({ authorization: "Bearer wrong-key" })).toBe("not_authorized");
    expect(await codeOf({ authorization: `Bearer ${KEY}` })).toBe("not_authorized");
    expect(await codeOf({ authorization: `Bearer ${KEY}`, "x-village-subject": "   " })).toBe("not_authorized");
    expect(await codeOf(as("x".repeat(201)))).toBe("not_authorized");
    expect(await codeOf({ "x-village-subject": "resident-1" })).toBe("not_authorized");
    expect((await call(deps, "my_loops", {}, as("x".repeat(200)))).structuredContent.joined).toBe(false);
  });

  test("an empty app key refuses every private call", async () => {
    const { deps } = setup({ appKey: "" });
    expect((await call(deps, "my_loops", {}, { authorization: "Bearer ", "x-village-subject": "r" })).structuredContent.code).toBe("not_authorized");
  });

  test("identity keys are refused at any depth, before anything else", async () => {
    const { deps } = setup();
    for (const args of [
      { offers: ["code_review"], wants: ["portrait_photo"], userId: "123" },
      { offers: ["code_review"], wants: ["portrait_photo"], nested: { Telegram_Id: 5 } },
      { residentId: "x" },
      { list: [{ UserName: "bob" }] },
    ]) {
      const result = await call(deps, "join", args, as("resident-1"));
      expect(result.structuredContent.code).toBe("invalid_arguments");
      expect(result.structuredContent.detail).toContain("identity");
    }
    expect((await call(deps, "board", { subject: "x" })).structuredContent.code).toBe("invalid_arguments");
  });

  test("the whole loop over MCP: join, propose, three yeses, confirm, complete", async () => {
    const { deps, ctx } = setup();
    await call(deps, "join", { offers: ["code_review"], wants: ["portrait_photo"], giftOnly: false, contactHandle: "@resident_one" }, as("r1"));
    await call(deps, "join", { offers: ["portrait_photo"], wants: ["stretch_session"], availability: ["sat"] }, as("r2"));
    const joined = await call(deps, "join", { offers: ["stretch_session"], wants: ["code_review"] }, as("r3"));
    expect(joined.structuredContent.newProposal).toBe(true);
    const mine = (await call(deps, "my_loops", {}, as("r1"))).structuredContent;
    const loopId = mine.loops[0].loopId;
    expect(mine.loops[0].status).toBe("proposed");
    for (const r of ["r1", "r2", "r3"]) await call(deps, "answer", { loopId, decision: "yes" }, as(r));
    const accepted = (await call(deps, "my_loops", {}, as("r3"))).structuredContent.loops[0];
    expect(accepted.status).toBe("accepted");
    expect(accepted.youReceive.from).toBe("@resident_one");
    // r1 gives, but is not the receiver of r1's own favor: r3 receives code review from r1.
    const wrong = await call(deps, "confirm", { loopId: "00000000-0000-4000-8000-0000000000ff", received: true }, as("r1"));
    expect(wrong.structuredContent.code).toBe("not_found");
    for (const r of ["r1", "r2", "r3"]) await call(deps, "confirm", { loopId, received: true }, as(r));
    expect((await call(deps, "board", {})).structuredContent.counts.loopsCompleted).toBe(1);
    const left = await call(deps, "leave", {}, as("r1"));
    expect(left.structuredContent.deleted).toBe(true);
    expect(JSON.stringify(ctx.db.query("SELECT * FROM members").all())).not.toContain("resident_one");
  });

  test("the demo key reaches an isolated village of test accounts, never the real one", async () => {
    const demo = testCtx();
    const { deps, ctx } = setup({ demo: { key: "demo-key-not-a-secret", ctx: demo.ctx } });
    const asTest = (subject: string) => ({ authorization: "Bearer demo-key-not-a-secret", "x-village-subject": subject });
    const joined = await call(deps, "join", { offers: ["code_review"], wants: ["portrait_photo"] }, asTest("demo-resident-1"));
    expect(joined.structuredContent.member.offers).toEqual(["code_review"]);
    expect(core.counts(demo.ctx).members).toBe(1);
    expect(core.counts(ctx).members).toBe(0);
    expect((await call(deps, "board", {})).structuredContent.counts.members).toBe(0); // the public board is real only
    expect((await call(deps, "my_loops", {}, as("demo-resident-1"))).structuredContent.joined).toBe(false);
  });

  test("rate limits answer rate_limited", async () => {
    const { deps } = setup({ memberLimiter: new RateLimiter(2, 60_000), ipLimiter: new RateLimiter(1, 60_000) });
    await call(deps, "my_loops", {}, as("r1"));
    await call(deps, "my_loops", {}, as("r1"));
    expect((await call(deps, "my_loops", {}, as("r1"))).structuredContent.code).toBe("rate_limited");
    expect((await call(deps, "my_loops", {}, as("r2"))).structuredContent.joined).toBe(false);
    await call(deps, "menu", {});
    expect((await call(deps, "menu", {})).structuredContent.code).toBe("rate_limited");
  });

  test("public reads carrying Agent Village's key are limited per resident, never per address", async () => {
    const { deps } = setup({ memberLimiter: new RateLimiter(2, 60_000), ipLimiter: new RateLimiter(1, 60_000) });
    // The whole village arrives from the app server's one address.
    for (let i = 0; i < 3; i++) expect((await call(deps, "menu", {}, { authorization: `Bearer ${KEY}` })).isError).toBeFalsy();
    await call(deps, "menu", {}, as("r1"));
    await call(deps, "board", {}, as("r1"));
    expect((await call(deps, "menu", {}, as("r1"))).structuredContent.code).toBe("rate_limited");
    expect((await call(deps, "menu", {}, as("r2"))).isError).toBeFalsy();
    // Without the key, or with a wrong one, the address limit applies.
    await call(deps, "menu", {});
    expect((await call(deps, "menu", {}, { authorization: "Bearer wrong" })).structuredContent.code).toBe("rate_limited");
  });

  test("every request leaves one log line of method, result and timing, the ones answered early too", async () => {
    const lines: Record<string, unknown>[] = [];
    const { deps } = setup({ log: line => lines.push(line) });
    await post(deps, "{not json");
    await post(deps, [{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    await post(deps, { jsonrpc: "2.0", method: "notifications/initialized" });
    await post(deps, { jsonrpc: "2.0", id: { bad: true }, method: "ping" });
    await handleMcp(new Request(`${BASE}/mcp`), "203.0.113.7", deps);
    await rpc(deps, "ping");
    expect(lines.map(l => `${l.method} ${l.result}`)).toEqual([
      "- parse_error", "- batch", "notifications/initialized notification", "ping invalid_request", "- method_not_allowed", "ping ok",
    ]);
    for (const line of lines) expect(Object.keys(line).sort()).toEqual(["method", "ms", "result"]);
  });

  test("no answer passes the 32 KiB cap", async () => {
    const { deps } = setup();
    for (let i = 0; i < 40; i++) {
      await call(deps, "join", { offers: ["code_review"], wants: ["portrait_photo"] }, as(`a${i}`));
      await call(deps, "join", { offers: ["portrait_photo"], wants: ["code_review"] }, as(`b${i}`));
    }
    const r = await rpc(deps, "tools/call", { name: "board", arguments: { limit: 20 } });
    expect(Buffer.byteLength(r.raw)).toBeLessThan(MAX_RESPONSE_BYTES);
    expect(r.body.result.structuredContent.recentLoops).toHaveLength(20);
  });
});
