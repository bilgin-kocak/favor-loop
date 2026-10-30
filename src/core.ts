// The six core operations every surface calls (join, myLoops, answer, confirm, leave, board), plus the
// matcher run and proposal expiry. All of it is synchronous SQLite, so each call is atomic.
import type { Database } from "bun:sqlite";
import { findMatches, groupKey, type Candidate, type Proposal, type Shape } from "./matcher";
import { favorLabel, listLabels, SLOTS } from "./menu";
import { JOIN_INPUT } from "./schemas";
import { validate } from "./validate";

export type ErrorCode =
  | "invalid_arguments" | "not_found" | "not_authorized" | "rate_limited"
  | "conflict" | "expired" | "in_progress" | "unavailable";

export class AppError extends Error {
  constructor(readonly code: ErrorCode, readonly detail: string) {
    super(code);
  }
}

export type Source = "av" | "tg" | "sim";
export type Status = "proposed" | "accepted" | "dissolved" | "expired" | "completed";
export type LoopEvent = {
  type: "proposed" | "accepted" | "dissolved" | "expired" | "completed" | "confirmed" | "remind";
  loopId: string;
  /** Members to tell about it. */
  notify: string[];
};

export interface Ctx {
  db: Database;
  now(): number;
  newId(): string;
  emit(event: LoopEvent): void;
  /** True for the simulated village: its data never mixes with the real one. */
  simulated: boolean;
  /** After this moment (DELETE_ALL_AT) nobody can join any more. */
  closesAt: number;
}

export const PROPOSAL_TTL_MS = 6 * 60 * 60 * 1000;
/** Receivers who have not confirmed get one reminder this long after everyone said yes. */
export const REMIND_AFTER_MS = 12 * 60 * 60 * 1000;
/** After this, an accepted loop no longer keeps its members out of new loops (it can still complete). */
export const STALE_ACCEPTED_MS = 24 * 60 * 60 * 1000;
const RECENT_CLOSED_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEADLINE = Date.parse("2026-10-30T13:00:00+05:30");
export const MEETING_PLACE = "The Circle, or online";

type MemberRow = {
  id: string; source: Source; offers: string; wants: string; gift_only: number; handle: string | null;
  availability: string; paused: number; joined_at: number; updated_at: number;
};
type LoopRow = {
  id: string; shape: Shape; status: Status; time_window: string; created_at: number; expires_at: number;
  accepted_at: number | null; closed_at: number | null; reminded_at: number | null;
};
type SeatRow = { loop_id: string; member_id: string; position: number; answer: "yes" | "no" | null };
type EdgeRow = {
  loop_id: string; position: number; giver: string; receiver: string; favor: string;
  confirmed: number; confirmed_at: number | null;
};
type FullLoop = LoopRow & { seats: SeatRow[]; edges: EdgeRow[] };

const list = (text: string) => JSON.parse(text) as string[];

// ---------------------------------------------------------------------------------------------- reads

function getMember(ctx: Ctx, id: string): MemberRow | null {
  return ctx.db.query<MemberRow, [string]>("SELECT * FROM members WHERE id = ?").get(id) ?? null;
}

function loadLoop(ctx: Ctx, loopId: string): FullLoop | null {
  const loop = ctx.db.query<LoopRow, [string]>("SELECT * FROM loops WHERE id = ?").get(loopId);
  if (!loop) return null;
  const seats = ctx.db.query<SeatRow, [string]>("SELECT * FROM seats WHERE loop_id = ? ORDER BY position").all(loopId);
  const edges = ctx.db.query<EdgeRow, [string]>("SELECT * FROM edges WHERE loop_id = ? ORDER BY position").all(loopId);
  return { ...loop, seats, edges };
}

/** The loop if `memberId` sits in it; anyone else gets not_found, so a loop id reveals nothing. */
function loopOf(ctx: Ctx, memberId: string, loopId: string): FullLoop {
  const loop = loadLoop(ctx, loopId);
  if (!loop || !loop.seats.some(s => s.member_id === memberId)) {
    throw new AppError("not_found", "No loop with that loopId includes you; use a loopId that my_loops returned.");
  }
  return loop;
}

function requireMember(ctx: Ctx, memberId: string): MemberRow {
  const member = getMember(ctx, memberId);
  if (!member) throw new AppError("not_found", "You have not joined Favor Loop yet.");
  return member;
}

/** proposed loops past their deadline count as expired even before the timer writes it. */
const effectiveStatus = (ctx: Ctx, loop: LoopRow): Status =>
  loop.status === "proposed" && loop.expires_at <= ctx.now() ? "expired" : loop.status;

// ---------------------------------------------------------------------------------------------- views

export function memberView(row: MemberRow) {
  return {
    offers: list(row.offers),
    wants: list(row.wants),
    giftOnly: row.gift_only === 1,
    contactHandle: row.handle,
    availability: list(row.availability),
    paused: row.paused === 1,
  };
}
export type MemberView = ReturnType<typeof memberView>;

const IST = "Asia/Kolkata";
/** "Thu 20:15 IST" */
export function istTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: IST, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(ms);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("hour")}:${get("minute")} IST`;
}
/** ISO 8601 in IST, to the second: 2026-10-29T20:15:00+05:30 */
export function istIso(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000 + 5.5 * 3600_000).toISOString().replace(/\.000Z$/, "+05:30");
}

/** Everything one member may see of one loop. Handles appear only once everyone said yes, and only for the
 * people this member gives to or receives from. */
export function loopView(ctx: Ctx, loop: FullLoop, me: string) {
  const status = effectiveStatus(ctx, loop);
  const revealed = status === "accepted" || status === "completed";
  const order = loop.seats.map(s => s.member_id);
  // Name the others in loop order starting after me: "a resident", then "another resident".
  const start = loop.shape === "chain" ? 0 : order.indexOf(me);
  const others = [...order.slice(start), ...order.slice(0, start)].filter(id => id !== me);
  const myGift = loop.edges.find(e => e.giver === me) ?? null;
  const myReceipt = loop.edges.find(e => e.receiver === me) ?? null;
  const neighbours = new Set([myGift?.receiver, myReceipt?.giver].filter((id): id is string => !!id));
  const handles = new Map<string, string | null>();
  if (revealed) for (const id of neighbours) handles.set(id, getMember(ctx, id)?.handle ?? null);
  const generic = ["a resident", "another resident"];
  const label = (id: string) => (id === me ? "you" : handles.get(id) ?? generic[others.indexOf(id)] ?? "a resident");

  const contacts = revealed
    ? [...neighbours].map(id => ({
        role: [myGift?.receiver === id ? "you give to" : "", myReceipt?.giver === id ? "you receive from" : ""].filter(Boolean).join(" and "),
        handle: handles.get(id) ?? null,
      }))
    : [];
  const mySeat = loop.seats.find(s => s.member_id === me);
  return {
    loopId: loop.id,
    shape: loop.shape,
    status,
    window: loop.time_window,
    place: MEETING_PLACE,
    ...(status === "proposed" ? { answerBy: istIso(loop.expires_at) } : {}),
    youGive: myGift ? { favor: myGift.favor, label: favorLabel(myGift.favor), to: label(myGift.receiver) } : null,
    youReceive: myReceipt ? { favor: myReceipt.favor, label: favorLabel(myReceipt.favor), from: label(myReceipt.giver) } : null,
    steps: loop.edges.map(e => ({ from: label(e.giver), to: label(e.receiver), favor: e.favor })),
    yourAnswer: mySeat?.answer ?? null,
    waitingFor: status === "proposed" ? loop.seats.filter(s => s.answer === null).length : 0,
    contacts,
    youReceived: myReceipt ? myReceipt.confirmed === 1 : null,
    favorsConfirmed: loop.edges.filter(e => e.confirmed === 1).length,
    favorsTotal: loop.edges.length,
  };
}
export type LoopView = ReturnType<typeof loopView>;

/** One plain sentence about one loop, for the member. */
export function loopSentence(v: LoopView): string {
  const give = v.youGive ? `you give ${v.youGive.label} to ${v.youGive.to}` : "";
  const get = v.youReceive ? `${v.youReceive.from} gives ${v.youReceive.label} to you` : "";
  const what = [give, get].filter(Boolean).join(" and ");
  switch (v.status) {
    case "proposed":
      return v.yourAnswer === "yes"
        ? `You said yes to a loop where ${what}; waiting for ${v.waitingFor} more yes.`
        : `Proposed loop: ${what}, ${v.window}; say yes or no by ${istTime(Date.parse(v.answerBy!))}.`;
    case "accepted":
      return `Everyone said yes: ${what}, ${v.window} at ${MEETING_PLACE}.`;
    case "completed":
      return `Loop complete: ${what}, and all ${v.favorsTotal} favors are confirmed.`;
    case "dissolved":
      return "A loop proposed to you did not go ahead, and you are back in the pool.";
    case "expired":
      return "A loop proposed to you expired before everyone answered.";
  }
}

// ---------------------------------------------------------------------------------------------- matching

function suggestWindow(members: MemberRow[], now: number): string {
  const live = SLOTS.filter(s => s.endsAt > now);
  const given = members.map(m => list(m.availability)).filter(a => a.length > 0);
  const common = live.filter(s => given.every(a => a.includes(s.id)));
  if (given.length > 0 && common.length > 0) return common[0].label;
  return now < DEFAULT_DEADLINE ? "by Friday 13:00" : "before the village ends on 1 Nov";
}

function insertLoop(ctx: Ctx, proposal: Proposal, rows: Map<string, MemberRow>): string {
  const id = ctx.newId();
  const now = ctx.now();
  const window = suggestWindow(proposal.members.map(m => rows.get(m)!), now);
  ctx.db.query("INSERT INTO loops (id, shape, status, time_window, created_at, expires_at) VALUES (?, ?, 'proposed', ?, ?, ?)")
    .run(id, proposal.shape, window, now, now + PROPOSAL_TTL_MS);
  proposal.members.forEach((member, position) =>
    ctx.db.query("INSERT INTO seats (loop_id, member_id, position) VALUES (?, ?, ?)").run(id, member, position));
  proposal.edges.forEach((e, position) =>
    ctx.db.query("INSERT INTO edges (loop_id, position, giver, receiver, favor) VALUES (?, ?, ?, ?, ?)")
      .run(id, position, e.giver, e.receiver, e.favor));
  return id;
}

/** Members a new loop must not include: in a proposal, or in a loop accepted less than a day ago. */
function busyMembers(ctx: Ctx): Set<string> {
  return new Set(ctx.db.query<{ member_id: string }, [number]>(
    `SELECT s.member_id FROM seats s JOIN loops l ON l.id = s.loop_id
     WHERE l.status = 'proposed' OR (l.status = 'accepted' AND l.accepted_at > ?)`,
  ).all(ctx.now() - STALE_ACCEPTED_MS).map(r => r.member_id));
}

/** Proposes every loop it can find among free, unpaused members. Returns the new loops. */
export function runMatcher(ctx: Ctx): { loopId: string; members: string[] }[] {
  const created: { loopId: string; members: string[] }[] = [];
  ctx.db.transaction(() => {
    const busy = busyMembers(ctx);
    const rows = ctx.db.query<MemberRow, []>("SELECT * FROM members WHERE paused = 0 ORDER BY joined_at, id").all();
    const byId = new Map(rows.map(r => [r.id, r]));
    const candidates: Candidate[] = rows.filter(r => !busy.has(r.id))
      .map(r => ({ id: r.id, offers: list(r.offers), wants: list(r.wants), giftOnly: r.gift_only === 1 }));
    const blocked = new Set(ctx.db.query<{ group_key: string }, []>("SELECT group_key FROM blocked_groups").all().map(r => r.group_key));
    // A group whose loop is still accepted is never proposed again beside it, stale or not.
    const accepted = new Map<string, string[]>();
    for (const r of ctx.db.query<{ loop_id: string; member_id: string }, []>(
      "SELECT s.loop_id, s.member_id FROM seats s JOIN loops l ON l.id = s.loop_id WHERE l.status = 'accepted'",
    ).all()) accepted.set(r.loop_id, [...(accepted.get(r.loop_id) ?? []), r.member_id]);
    for (const members of accepted.values()) blocked.add(groupKey(members));
    for (const proposal of findMatches(candidates, blocked)) {
      created.push({ loopId: insertLoop(ctx, proposal, byId), members: proposal.members });
    }
  })();
  for (const c of created) ctx.emit({ type: "proposed", loopId: c.loopId, notify: c.members });
  return created;
}

/**
 * The minute timer: overdue proposals expire (whoever did not answer is paused until they act again), and
 * receivers in loops accepted 12 hours ago who have not confirmed get one reminder.
 */
export function expireDue(ctx: Ctx): number {
  const now = ctx.now();
  const due = ctx.db.query<LoopRow, [number]>("SELECT * FROM loops WHERE status = 'proposed' AND expires_at <= ?").all(now);
  for (const loop of due) expireLoop(ctx, loop.id);
  if (due.length > 0) runMatcher(ctx);
  const remind = ctx.db.query<LoopRow, [number]>(
    "SELECT * FROM loops WHERE status = 'accepted' AND reminded_at IS NULL AND accepted_at <= ?",
  ).all(now - REMIND_AFTER_MS);
  for (const loop of remind) {
    ctx.db.query("UPDATE loops SET reminded_at = ? WHERE id = ?").run(now, loop.id);
    const waiting = ctx.db.query<{ receiver: string }, [string]>("SELECT receiver FROM edges WHERE loop_id = ? AND confirmed = 0 ORDER BY position")
      .all(loop.id).map(e => e.receiver);
    if (waiting.length > 0) ctx.emit({ type: "remind", loopId: loop.id, notify: waiting });
  }
  return due.length;
}

/**
 * `caller`, answering just now, is neither paused nor told: their own answer says it. Of the others who did not
 * answer, Telegram members were told and are paused. Agent Village members were never told (Favor Loop cannot
 * reach their agent; it hears only on asking), so they stay in the pool, and the group is blocked instead so the
 * same loop is not proposed again at once.
 */
function expireLoop(ctx: Ctx, loopId: string, caller?: string) {
  const seats = ctx.db.query<SeatRow, [string]>("SELECT * FROM seats WHERE loop_id = ? ORDER BY position").all(loopId);
  const silent = seats.filter(s => s.answer === null && s.member_id !== caller).map(s => s.member_id);
  ctx.db.transaction(() => {
    ctx.db.query("UPDATE loops SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'proposed'").run(ctx.now(), loopId);
    for (const id of silent) ctx.db.query("UPDATE members SET paused = 1 WHERE id = ? AND source != 'av'").run(id);
    if (silent.some(id => getMember(ctx, id)?.source === "av")) blockGroup(ctx, seats.map(s => s.member_id));
  })();
  ctx.emit({ type: "expired", loopId, notify: seats.map(s => s.member_id).filter(id => id !== caller) });
}

const blockGroup = (ctx: Ctx, members: string[]) =>
  ctx.db.query("INSERT OR IGNORE INTO blocked_groups (group_key, created_at) VALUES (?, ?)").run(groupKey(members), ctx.now());

// ---------------------------------------------------------------------------------------------- writes

export type JoinInput = { offers: string[]; wants?: string[]; giftOnly?: boolean; contactHandle?: string; availability?: string[] };

export function join(ctx: Ctx, memberId: string, source: Source, input: unknown) {
  if (ctx.now() >= ctx.closesAt) throw new AppError("unavailable", "Favor Loop has ended, and all its data has been deleted.");
  const problem = validate(JOIN_INPUT, input);
  if (problem) throw new AppError("invalid_arguments", problem);
  const choice = input as JoinInput;
  const wants = choice.wants ?? [];
  const giftOnly = choice.giftOnly === true;
  if (giftOnly && wants.length > 0) {
    throw new AppError("invalid_arguments", "A member who only wants to give (giftOnly true) lists no wants.");
  }
  if (!giftOnly && wants.length === 0) {
    throw new AppError("invalid_arguments", "Pick at least one favor you would like, or set giftOnly to true if you only want to give.");
  }
  const both = choice.offers.find(f => wants.includes(f));
  if (both) throw new AppError("invalid_arguments", `${both} cannot be in both offers and wants.`);
  const handle = choice.contactHandle ? `@${choice.contactHandle.replace(/^@/, "")}` : null;
  const now = ctx.now();
  ctx.db.query(
    `INSERT INTO members (id, source, offers, wants, gift_only, handle, availability, paused, joined_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (id) DO UPDATE SET offers = excluded.offers, wants = excluded.wants, gift_only = excluded.gift_only,
       handle = excluded.handle, availability = excluded.availability, paused = 0, updated_at = excluded.updated_at`,
  ).run(memberId, source, JSON.stringify(choice.offers), JSON.stringify(wants), giftOnly ? 1 : 0, handle,
    JSON.stringify(choice.availability ?? []), now, now);
  const fresh = runMatcher(ctx).some(c => c.members.includes(memberId));
  const open = openLoops(ctx, memberId);
  const saved = giftOnly
    ? `Saved: you offer ${listLabels(choice.offers)} as a gift`
    : `Saved: you offer ${listLabels(choice.offers)} and would like ${listLabels(wants)}`;
  const next = fresh
    ? "and a loop was just proposed to you, so check your loops to say yes or no."
    : open > 0
      ? "and your open loop stays as it is."
      : "and Favor Loop will propose a loop as soon as it finds one.";
  return { text: `${saved}, ${next}`, member: memberView(getMember(ctx, memberId)!), openLoops: open, newProposal: fresh };
}

function openLoops(ctx: Ctx, memberId: string): number {
  return ctx.db.query<{ n: number }, [string]>(
    "SELECT COUNT(*) AS n FROM seats s JOIN loops l ON l.id = s.loop_id WHERE s.member_id = ? AND l.status IN ('proposed', 'accepted')",
  ).get(memberId)!.n;
}

export function myLoops(ctx: Ctx, memberId: string) {
  const member = getMember(ctx, memberId);
  if (!member) {
    return {
      text: "You have not joined Favor Loop yet: read the menu, then join with 1 to 3 favors you can give and 1 to 3 you would like.",
      joined: false,
      member: null,
      loops: [] as LoopView[],
    };
  }
  const ids = ctx.db.query<{ id: string }, [string, number]>(
    `SELECT l.id FROM loops l JOIN seats s ON s.loop_id = l.id WHERE s.member_id = ?
       AND (l.status IN ('proposed', 'accepted', 'completed') OR l.closed_at > ?)
     ORDER BY l.created_at DESC LIMIT 10`,
  ).all(memberId, ctx.now() - RECENT_CLOSED_MS);
  const loops = ids.map(r => loopView(ctx, loadLoop(ctx, r.id)!, memberId));
  const view = memberView(member);
  const waiting = loops.filter(l => l.status === "proposed" && l.yourAnswer === null);
  const accepted = loops.find(l => l.status === "accepted");
  const pending = loops.find(l => l.status === "proposed");
  let text: string;
  if (waiting.length > 0) text = `${loopSentence(waiting[0])}${waiting.length > 1 ? ` (${waiting.length} loops are waiting for you.)` : ""}`;
  else if (accepted) text = loopSentence(accepted);
  else if (pending) text = loopSentence(pending);
  else if (view.paused) text = "Matching is paused because a proposal expired without your answer; join again to get back in the pool.";
  else {
    const done = loops.filter(l => l.status === "completed").length;
    text = `No open loop right now; you are in the pool with ${view.offers.length} favor${view.offers.length === 1 ? "" : "s"} to give${done ? ` and ${done} completed loop${done === 1 ? "" : "s"} behind you` : ""}.`;
  }
  return { text, joined: true, member: view, loops };
}

export function answer(ctx: Ctx, memberId: string, loopId: string, decision: "yes" | "no") {
  requireMember(ctx, memberId);
  const loop = loopOf(ctx, memberId, loopId);
  const overdue = loop.status === "proposed" && loop.expires_at <= ctx.now();
  if (overdue || loop.status === "expired") {
    // A late answer: the loop is over either way, but a late no still keeps this group from coming back,
    // and whoever answers is plainly here, so they stay in the pool.
    if (overdue) expireLoop(ctx, loop.id, memberId);
    if (decision === "no") blockGroup(ctx, loop.seats.map(s => s.member_id));
    ctx.db.query("UPDATE members SET paused = 0 WHERE id = ?").run(memberId);
    runMatcher(ctx);
    throw new AppError("expired", decision === "no"
      ? "That proposal had already expired, so it will not go ahead, and it will not be proposed again."
      : "That proposal expired before everyone answered.");
  }
  const seat = loop.seats.find(s => s.member_id === memberId)!;
  if (loop.status !== "proposed") {
    if (seat.answer === decision && loop.status === "accepted") return answered(ctx, loopId, memberId); // a repeated yes
    throw new AppError("conflict", `That loop is no longer waiting for answers (it is ${loop.status}).`);
  }
  if (seat.answer === decision) return answered(ctx, loopId, memberId);

  const now = ctx.now();
  if (decision === "no") {
    ctx.db.transaction(() => {
      ctx.db.query("UPDATE seats SET answer = 'no' WHERE loop_id = ? AND member_id = ?").run(loopId, memberId);
      ctx.db.query("UPDATE loops SET status = 'dissolved', closed_at = ? WHERE id = ?").run(now, loopId);
      blockGroup(ctx, loop.seats.map(s => s.member_id));
    })();
    ctx.emit({ type: "dissolved", loopId, notify: loop.seats.map(s => s.member_id).filter(id => id !== memberId) });
    runMatcher(ctx);
    return {
      text: "You said no, so this loop will not go ahead; the others are not told who said no, and you are back in the pool.",
      loop: loopView(ctx, loadLoop(ctx, loopId)!, memberId),
    };
  }

  const everyone = loop.seats.every(s => s.member_id === memberId || s.answer === "yes");
  ctx.db.transaction(() => {
    ctx.db.query("UPDATE seats SET answer = 'yes' WHERE loop_id = ? AND member_id = ?").run(loopId, memberId);
    if (everyone) ctx.db.query("UPDATE loops SET status = 'accepted', accepted_at = ? WHERE id = ?").run(now, loopId);
  })();
  if (everyone) ctx.emit({ type: "accepted", loopId, notify: loop.seats.map(s => s.member_id) });
  return answered(ctx, loopId, memberId);
}

function answered(ctx: Ctx, loopId: string, memberId: string) {
  const view = loopView(ctx, loadLoop(ctx, loopId)!, memberId);
  const text = view.status === "accepted"
    ? `${loopSentence(view)} Contacts are in the loop now.`
    : `You said yes; the loop starts when the other ${view.waitingFor === 1 ? "member says" : `${view.waitingFor} members say`} yes too.`;
  return { text, loop: view };
}

export function confirm(ctx: Ctx, memberId: string, loopId: string, received: boolean) {
  requireMember(ctx, memberId);
  const loop = loopOf(ctx, memberId, loopId);
  const edge = loop.edges.find(e => e.receiver === memberId);
  const status = effectiveStatus(ctx, loop);
  if (status === "completed") {
    if (received && edge) return { text: "Already confirmed: this loop is complete.", loop: loopView(ctx, loop, memberId) };
    throw new AppError("conflict", "This loop is already complete.");
  }
  if (status === "proposed") throw new AppError("conflict", "Not everyone has said yes to this loop yet, so there is nothing to confirm.");
  if (status !== "accepted") throw new AppError("conflict", `That loop did not go ahead (it is ${status}).`);
  if (!edge) throw new AppError("not_authorized", "Only the person who received a favor can confirm it, and in this loop you only give.");

  const now = ctx.now();
  if (!received) {
    if (edge.confirmed === 1) {
      ctx.db.query("UPDATE edges SET confirmed = 0, confirmed_at = NULL WHERE loop_id = ? AND position = ?").run(loopId, edge.position);
    }
    return { text: "Noted: you have not received your favor yet, and the loop stays open.", loop: loopView(ctx, loadLoop(ctx, loopId)!, memberId) };
  }
  if (edge.confirmed === 1) return { text: "Already confirmed: thank you.", loop: loopView(ctx, loop, memberId) };

  const allDone = loop.edges.every(e => e.position === edge.position || e.confirmed === 1);
  const member = getMember(ctx, memberId)!;
  ctx.db.transaction(() => {
    ctx.db.query("UPDATE edges SET confirmed = 1, confirmed_at = ? WHERE loop_id = ? AND position = ?").run(now, loopId, edge.position);
    // They got it, so it is no longer a want: the matcher will not offer the same favor again.
    ctx.db.query("UPDATE members SET wants = ? WHERE id = ?").run(JSON.stringify(list(member.wants).filter(f => f !== edge.favor)), memberId);
    if (allDone) ctx.db.query("UPDATE loops SET status = 'completed', closed_at = ? WHERE id = ?").run(now, loopId);
  })();
  ctx.emit({ type: "confirmed", loopId, notify: [edge.giver] });
  if (allDone) {
    ctx.emit({ type: "completed", loopId, notify: loop.seats.map(s => s.member_id) });
    runMatcher(ctx); // everyone in it is free for a new loop
  }
  const view = loopView(ctx, loadLoop(ctx, loopId)!, memberId);
  return {
    text: allDone
      ? `Confirmed, and that was the last favor: the loop is complete and lights up on the board.`
      : `Confirmed: ${view.favorsConfirmed} of ${view.favorsTotal} favors in this loop are done.`,
    loop: view,
  };
}

/** Deletes everything held for the member. Open loops dissolve; past loops keep an anonymous placeholder. */
export function leave(ctx: Ctx, memberId: string) {
  const member = getMember(ctx, memberId);
  if (!member) return { text: "Favor Loop holds nothing about you, so there was nothing to delete.", deleted: false };
  const now = ctx.now();
  const mine = ctx.db.query<{ loop_id: string; status: Status }, [string]>(
    "SELECT s.loop_id, l.status FROM seats s JOIN loops l ON l.id = s.loop_id WHERE s.member_id = ?",
  ).all(memberId);
  const dissolved: { loopId: string; others: string[] }[] = [];
  ctx.db.transaction(() => {
    for (const { loop_id, status } of mine) {
      const others = ctx.db.query<{ member_id: string }, [string, string]>(
        "SELECT member_id FROM seats WHERE loop_id = ? AND member_id != ?",
      ).all(loop_id, memberId).map(r => r.member_id);
      if (status === "proposed" || status === "accepted") {
        ctx.db.query("UPDATE loops SET status = 'dissolved', closed_at = ? WHERE id = ?").run(now, loop_id);
        dissolved.push({ loopId: loop_id, others });
      }
      const placeholder = `gone:${ctx.newId()}`;
      ctx.db.query("UPDATE seats SET member_id = ? WHERE loop_id = ? AND member_id = ?").run(placeholder, loop_id, memberId);
      ctx.db.query("UPDATE edges SET giver = ? WHERE loop_id = ? AND giver = ?").run(placeholder, loop_id, memberId);
      ctx.db.query("UPDATE edges SET receiver = ? WHERE loop_id = ? AND receiver = ?").run(placeholder, loop_id, memberId);
    }
    ctx.db.query("DELETE FROM blocked_groups WHERE instr(group_key, ?) > 0").run(memberId);
    ctx.db.query("DELETE FROM tg_routes WHERE member_id = ?").run(memberId);
    ctx.db.query("DELETE FROM members WHERE id = ?").run(memberId);
  })();
  for (const d of dissolved) ctx.emit({ type: "dissolved", loopId: d.loopId, notify: d.others });
  runMatcher(ctx);
  return {
    text: dissolved.length > 0
      ? `Done: everything Favor Loop held about you is deleted, and your ${dissolved.length === 1 ? "open loop was" : "open loops were"} dissolved.`
      : "Done: everything Favor Loop held about you is deleted.",
    deleted: true,
  };
}

/** Clears a pause (Telegram's /resume; the MCP side resumes by joining again). */
export function resume(ctx: Ctx, memberId: string): boolean {
  const changed = ctx.db.query("UPDATE members SET paused = 0 WHERE id = ? AND paused = 1").run(memberId).changes > 0;
  if (changed) runMatcher(ctx);
  return changed;
}

// ---------------------------------------------------------------------------------------------- board

export function counts(ctx: Ctx) {
  const n = (sql: string) => ctx.db.query<{ n: number }, []>(sql).get()!.n;
  return {
    members: n("SELECT COUNT(*) AS n FROM members"),
    loopsProposed: n("SELECT COUNT(*) AS n FROM loops"),
    loopsAccepted: n("SELECT COUNT(*) AS n FROM loops WHERE status IN ('accepted', 'completed')"),
    loopsCompleted: n("SELECT COUNT(*) AS n FROM loops WHERE status = 'completed'"),
    favorsConfirmed: n("SELECT COUNT(*) AS n FROM edges e JOIN loops l ON l.id = e.loop_id WHERE e.confirmed = 1 AND l.status IN ('accepted', 'completed')"),
  };
}

/** The anonymous board: counts and recent loops, never a member, a name or a handle. */
export function board(ctx: Ctx, limit = 10) {
  const c = counts(ctx);
  const loops = ctx.db.query<LoopRow, [number]>(
    "SELECT * FROM loops WHERE status IN ('proposed', 'accepted', 'completed') ORDER BY created_at DESC LIMIT ?",
  ).all(limit);
  const recentLoops = loops.map(l => ({
    shape: l.shape,
    favors: ctx.db.query<{ favor: string }, [string]>("SELECT favor FROM edges WHERE loop_id = ? ORDER BY position").all(l.id).map(e => e.favor),
    status: effectiveStatus(ctx, l),
  }));
  const who = ctx.simulated ? "simulated members" : "residents";
  return {
    text: `${c.members} ${who} have joined; ${c.loopsProposed} loops proposed, ${c.loopsAccepted} accepted, ${c.loopsCompleted} completed and ${c.favorsConfirmed} favors confirmed.`,
    simulated: ctx.simulated,
    counts: c,
    recentLoops,
  };
}

const HOUR_MS = 60 * 60 * 1000;
const rotate = <T>(items: T[], start: number) => [...items.slice(start), ...items.slice(0, start)];

/**
 * What the web board draws, with nothing that follows a member from view to view: the pool is a count, a dot's
 * id is new for every loop, a ring starts at its smallest dot rather than its first joiner (seats are in join
 * order; a chain keeps its giver-first order, which is its meaning), and times are rounded down to the hour.
 */
export function boardGraph(ctx: Ctx, anon: (value: string) => string) {
  const loops = ctx.db.query<LoopRow, []>(
    "SELECT * FROM loops WHERE status IN ('proposed', 'accepted', 'completed') ORDER BY created_at DESC LIMIT 60",
  ).all().reverse();
  const busy = busyMembers(ctx);
  const pool = ctx.db.query<{ id: string }, []>("SELECT id FROM members").all().filter(m => !busy.has(m.id)).length;
  return {
    simulated: ctx.simulated,
    counts: counts(ctx),
    pool,
    loops: loops.map(l => {
      const full = loadLoop(ctx, l.id)!;
      const dot = (member: string) => anon(`${l.id}:${member}`);
      let members = full.seats.map(s => dot(s.member_id));
      let edges = full.edges.map(e => ({ from: dot(e.giver), to: dot(e.receiver), favor: e.favor, confirmed: e.confirmed === 1 }));
      if (l.shape !== "chain") {
        const start = members.indexOf([...members].sort()[0]);
        members = rotate(members, start);
        edges = rotate(edges, start);
      }
      return {
        id: anon(`loop:${l.id}`),
        shape: l.shape,
        status: effectiveStatus(ctx, l),
        members,
        edges,
        createdAt: Math.floor(l.created_at / HOUR_MS) * HOUR_MS,
      };
    }),
  };
}

export function loopSummaryFor(ctx: Ctx, loopId: string, memberId: string): LoopView | null {
  const loop = loadLoop(ctx, loopId);
  return loop && loop.seats.some(s => s.member_id === memberId) ? loopView(ctx, loop, memberId) : null;
}

export function isMember(ctx: Ctx, memberId: string): boolean {
  return getMember(ctx, memberId) !== null;
}

export function getMemberView(ctx: Ctx, memberId: string): MemberView | null {
  const row = getMember(ctx, memberId);
  return row ? memberView(row) : null;
}

/** Admin numbers: no member detail, only totals. */
export function stats(ctx: Ctx) {
  const bySource = ctx.db.query<{ source: string; n: number }, []>("SELECT source, COUNT(*) AS n FROM members GROUP BY source").all();
  const byStatus = ctx.db.query<{ status: string; n: number }, []>("SELECT status, COUNT(*) AS n FROM loops GROUP BY status").all();
  const paused = ctx.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM members WHERE paused = 1").get()!.n;
  return { ...counts(ctx), paused, bySource, byStatus };
}
