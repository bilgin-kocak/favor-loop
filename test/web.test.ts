import { describe, expect, test } from "bun:test";
import * as core from "../src/core";
import { makeIdentity } from "../src/identity";
import { makeFetch } from "../src/web";
import { testCtx } from "./helpers";

function app() {
  const t = testCtx();
  const identity = makeIdentity("web-test");
  const fetch = makeFetch({
    mcp: { ctx: t.ctx, identity, appKey: "k", publicBaseUrl: "https://favorloop.example.org" },
    publicDir: new URL("../public", import.meta.url).pathname,
    realGraph: () => core.boardGraph(t.ctx, identity.anon),
    simGraph: () => ({ simulated: true, counts: core.counts(t.ctx), pool: [], loops: [] }),
    demoGraph: null,
    restartSim: () => true,
    botUrl: () => "https://t.me/favorloop_test_bot",
  });
  return (path: string, init?: RequestInit) => fetch(new Request(`https://favorloop.example.org${path}`, init));
}

describe("web", () => {
  test("every page renders with no template marker left and the bot link filled in", async () => {
    const get = app();
    for (const path of ["/", "/board", "/how", "/sim"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain("{{");
      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    }
    expect(await (await get("/")).text()).toContain("https://t.me/favorloop_test_bot");
    expect(await (await get("/how")).text()).toContain("All data is deleted on 30 Nov 2026");
  });

  test("the board JSON is anonymous, and unknown paths are 404 with no redirect", async () => {
    const get = app();
    const real = (await (await get("/api/board")).json()) as { simulated: boolean };
    expect(real.simulated).toBe(false);
    expect(((await (await get("/api/board?view=sim")).json()) as { simulated: boolean }).simulated).toBe(true);
    for (const path of ["/mcp/", "/board/", "/nope"]) expect((await get(path)).status).toBe(404);
    expect((await get("/healthz")).status).toBe(200);
    expect((await get("/api/sim/restart")).status).toBe(405);
    expect((await get("/api/sim/restart", { method: "POST" })).status).toBe(200);
  });
});
