// Entry point: one process serving the MCP endpoint, the web pages, the Telegram bot and the timers.
import { config, configProblems } from "./config";
import * as core from "./core";
import type { Ctx, LoopEvent } from "./core";
import { openDb, purgeAll } from "./db";
import { makeIdentity, makeSealer } from "./identity";
import { RateLimiter } from "./ratelimit";
import { SimVillage } from "./sim";
import { makeFetch } from "./web";

const log = (line: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...line }));
for (const problem of configProblems()) log({ event: "config", warning: problem });

const salt = config.hashSalt || "favorloop-insecure-development-salt";
const db = openDb(config.dbPath);
const identity = makeIdentity(salt);
const listeners: ((event: LoopEvent) => void)[] = [];
const ctx: Ctx = {
  db,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  emit: event => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (e) {
        log({ event: "listener_error", type: event.type, error: e instanceof Error ? e.name : "unknown" });
      }
    }
  },
  simulated: false,
  closesAt: config.deleteAllAt,
};

function purgeIfDue() {
  if (Date.now() < config.deleteAllAt) return;
  purgeAll(db);
  log({ event: "purge", result: "ok" });
}
purgeIfDue();

/** Recomputes at most every `ms`: many projectors polling cost one query. */
function cached<T>(fn: () => T, ms: number): () => T {
  let at = 0;
  let value: T;
  return () => {
    if (Date.now() - at > ms) {
      value = fn();
      at = Date.now();
    }
    return value;
  };
}

// Test accounts for demos live in their own in-memory village, reached only with FAVORLOOP_DEMO_KEY.
const demoCtx: Ctx | null = config.demoKey
  ? { db: openDb(":memory:"), now: () => Date.now(), newId: () => crypto.randomUUID(), emit: () => {}, simulated: false, closesAt: config.deleteAllAt }
  : null;

const sim = new SimVillage();
setInterval(() => {
  try {
    sim.step();
  } catch (e) {
    log({ event: "sim", error: e instanceof Error ? e.name : "unknown" });
    sim.reset();
  }
}, 3_000);

let botUrl = (): string | null => null;
let stopBot = async () => {};
if (config.telegramToken) {
  const { startBot } = await import("./bot");
  const bot = startBot({
    token: config.telegramToken, ctx, identity, sealer: makeSealer(salt), sim,
    publicBaseUrl: config.publicBaseUrl, adminIds: config.adminTgIds, log,
  });
  listeners.push(bot.onLoopEvent);
  botUrl = bot.url;
  stopBot = () => bot.stop();
}

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  fetch: makeFetch({
    mcp: {
      ctx,
      identity,
      appKey: config.appKey,
      publicBaseUrl: config.publicBaseUrl,
      memberLimiter: new RateLimiter(60, 60_000),
      ipLimiter: new RateLimiter(600, 60_000),
      log,
      ...(demoCtx ? { demo: { key: config.demoKey, ctx: demoCtx } } : {}),
    },
    publicDir: new URL("../public", import.meta.url).pathname,
    realGraph: cached(() => core.boardGraph(ctx, identity.anon), 2_000),
    simGraph: cached(() => core.boardGraph(sim.ctx, identity.anon), 1_000),
    demoGraph: demoCtx ? cached(() => core.boardGraph(demoCtx, identity.anon), 1_000) : null,
    restartSim: () => sim.restart(),
    botUrl: () => botUrl(),
  }),
});
log({ event: "listening", port: server.port, bot: config.telegramToken !== "" });

const every = (ms: number, name: string, fn: () => number) =>
  setInterval(() => {
    try {
      const n = fn();
      if (n > 0) log({ event: name, count: n });
    } catch (e) {
      log({ event: name, error: e instanceof Error ? e.name : "unknown" });
    }
  }, ms);
every(60_000, "expired", () => core.expireDue(ctx));
every(10 * 60_000, "matcher", () => core.runMatcher(ctx).length);
every(60 * 60_000, "purge", () => (purgeIfDue(), 0));

// One stray error must not take the endpoint and the bot down mid-event: state lives in SQLite transactions.
process.on("uncaughtException", e => log({ event: "uncaught", error: e.name }));
process.on("unhandledRejection", e => log({ event: "unhandled", error: e instanceof Error ? e.name : "unknown" }));

async function shutdown() {
  log({ event: "shutdown" });
  await stopBot().catch(() => {});
  server.stop();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
