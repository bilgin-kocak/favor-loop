import { openDb } from "../src/db";
import type { Ctx, LoopEvent } from "../src/core";

export const START = Date.parse("2026-10-29T15:00:00+05:30");

/** An in-memory village with a hand-turned clock and predictable loop ids. */
export function testCtx(start = START) {
  let now = start;
  let n = 0;
  const events: LoopEvent[] = [];
  const ctx: Ctx = {
    db: openDb(":memory:"),
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    emit: e => events.push(e),
    simulated: false,
    closesAt: Date.parse("2026-11-30T00:00:00+05:30"),
  };
  return { ctx, events, advance: (ms: number) => { now += ms; } };
}
