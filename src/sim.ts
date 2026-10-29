// The simulated village: 150 synthetic members in their own in-memory database, run through the SAME core
// and matcher. It never touches the real database, and everything it shows is labelled SIMULATED.
import * as core from "./core";
import type { Ctx } from "./core";
import { openDb } from "./db";
import { FAVOR_IDS, SLOT_IDS } from "./menu";

const SIZE = 150;
const START_SIZE = 40;
// portrait_photo and ai_tool_setup are the popular asks.
const WANT_WEIGHT: Record<string, number> = { portrait_photo: 6, ai_tool_setup: 6, pitch_feedback: 2, goa_tips: 2 };
const OFFER_WEIGHT: Record<string, number> = { portrait_photo: 2, ai_tool_setup: 2, code_review: 2 };

/** mulberry32: a tiny seeded PRNG, so a run can be replayed from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimVillage {
  ctx!: Ctx;
  private random!: () => number;
  private joined = 0;
  private quietTicks = 0;
  private lastReset = 0;

  constructor(seed = Date.now()) {
    this.reset(seed);
  }

  reset(seed = Date.now()) {
    this.ctx?.db.close();
    this.random = rng(seed);
    const random = this.random;
    this.ctx = {
      db: openDb(":memory:"),
      now: () => Date.now(),
      newId: () => {
        const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[Math.floor(random() * 4)]}${hex.slice(17, 20)}-${hex.slice(20)}`;
      },
      emit: () => {},
      simulated: true,
      closesAt: Number.POSITIVE_INFINITY,
    };
    this.joined = 0;
    this.quietTicks = 0;
    this.lastReset = Date.now();
    for (let i = 0; i < START_SIZE; i++) this.addMember();
  }

  /** At most once every 10 seconds, so a button cannot hammer it. */
  restart(): boolean {
    if (Date.now() - this.lastReset < 10_000) return false;
    this.reset();
    return true;
  }

  private pick(weights: Record<string, number>, count: number, exclude: string[] = []): string[] {
    const chosen: string[] = [];
    while (chosen.length < count) {
      const pool = FAVOR_IDS.filter(id => !chosen.includes(id) && !exclude.includes(id));
      const total = pool.reduce((sum, id) => sum + (weights[id] ?? 1), 0);
      let roll = this.random() * total;
      for (const id of pool) {
        roll -= weights[id] ?? 1;
        if (roll <= 0) {
          chosen.push(id);
          break;
        }
      }
    }
    return chosen;
  }

  private addMember() {
    const giftOnly = this.random() < 0.06;
    const offers = this.pick(OFFER_WEIGHT, 2 + Math.floor(this.random() * 2));
    const wants = giftOnly ? [] : this.pick(WANT_WEIGHT, 2 + Math.floor(this.random() * 2), offers);
    const availability = SLOT_IDS.filter(() => this.random() < 0.3);
    core.join(this.ctx, `sim-${String(this.joined).padStart(3, "0")}`, "sim", { offers, wants, giftOnly, availability });
    this.joined += 1;
  }

  /** One beat of village life: a few arrivals, some answers, some favors done. */
  step() {
    const { db } = this.ctx;
    for (let i = 0; i < 3 && this.joined < SIZE; i++) if (this.random() < 0.7) this.addMember();
    const seats = db.query<{ loop_id: string; member_id: string }, []>(
      "SELECT s.loop_id, s.member_id FROM seats s JOIN loops l ON l.id = s.loop_id WHERE l.status = 'proposed' AND s.answer IS NULL",
    ).all();
    for (const s of seats) {
      if (this.random() >= 0.3) continue;
      try {
        core.answer(this.ctx, s.member_id, s.loop_id, this.random() < 0.9 ? "yes" : "no");
      } catch { /* the loop may have dissolved a moment ago */ }
    }
    const edges = db.query<{ loop_id: string; receiver: string }, []>(
      "SELECT e.loop_id, e.receiver FROM edges e JOIN loops l ON l.id = e.loop_id WHERE l.status = 'accepted' AND e.confirmed = 0",
    ).all();
    for (const e of edges) {
      if (this.random() >= 0.2) continue;
      try {
        core.confirm(this.ctx, e.receiver, e.loop_id, true);
      } catch { /* already settled */ }
    }
    const open = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM loops WHERE status IN ('proposed', 'accepted')").get()!.n;
    this.quietTicks = this.joined >= SIZE && open === 0 ? this.quietTicks + 1 : 0;
    if (this.quietTicks >= 10) this.reset();
  }
}
