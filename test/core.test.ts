import { describe, expect, test } from "bun:test";
import * as core from "../src/core";
import { AppError, PROPOSAL_TTL_MS, REMIND_AFTER_MS, STALE_ACCEPTED_MS } from "../src/core";
import { makeIdentity } from "../src/identity";
import { testCtx } from "./helpers";

const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), G = "e".repeat(64);

/** The spec's example: no two of A, B, C could swap, the three of them can loop. */
function village() {
  const t = testCtx();
  core.join(t.ctx, A, "av", { offers: ["code_review"], wants: ["portrait_photo"], contactHandle: "alice_av" });
  core.join(t.ctx, B, "tg", { offers: ["portrait_photo"], wants: ["stretch_session"], contactHandle: "@bob_tg" });
  const third = core.join(t.ctx, C, "av", { offers: ["stretch_session"], wants: ["code_review"] });
  const loopId = core.myLoops(t.ctx, A).loops[0].loopId;
  return { ...t, third, loopId };
}

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "ok";
};

describe("join", () => {
  test("rejects the same id in offers and wants", () => {
    const { ctx } = testCtx();
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["code_review"], wants: ["code_review"] }))).toBe("invalid_arguments");
  });
  test("needs a want unless giftOnly, and a giftOnly member lists no wants", () => {
    const { ctx } = testCtx();
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["code_review"] }))).toBe("invalid_arguments");
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["code_review"], wants: ["goa_tips"], giftOnly: true }))).toBe("invalid_arguments");
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["code_review"], giftOnly: true }))).toBe("ok");
  });
  test("rejects ids that are not on the menu and too many items", () => {
    const { ctx } = testCtx();
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["massage"], wants: ["goa_tips"] }))).toBe("invalid_arguments");
    expect(codeOf(() => core.join(ctx, A, "av", { offers: ["code_review", "cv_review", "proofreading", "goa_tips"], wants: ["music_lesson"] }))).toBe("invalid_arguments");
  });
  test("joining again replaces the choices", () => {
    const { ctx } = testCtx();
    core.join(ctx, A, "av", { offers: ["code_review"], wants: ["goa_tips"], contactHandle: "alice_av" });
    const r = core.join(ctx, A, "av", { offers: ["music_lesson"], wants: ["portrait_photo"] });
    expect(r.member).toEqual({ offers: ["music_lesson"], wants: ["portrait_photo"], giftOnly: false, contactHandle: null, availability: [], paused: false });
  });
  test("refuses joins after the deletion date", () => {
    const t = testCtx(Date.parse("2026-11-30T00:00:00+05:30"));
    expect(codeOf(() => core.join(t.ctx, A, "av", { offers: ["code_review"], wants: ["goa_tips"] }))).toBe("unavailable");
  });
});

describe("loop lifecycle", () => {
  test("a three-loop is proposed to all three, with handles hidden", () => {
    const { ctx, events, third, loopId } = village();
    expect(third.newProposal).toBe(true);
    expect(events).toEqual([{ type: "proposed", loopId, notify: [A, C, B] }]);
    const view = core.myLoops(ctx, A).loops[0];
    expect(view.status).toBe("proposed");
    expect(view.youGive).toEqual({ favor: "code_review", label: "Code review", to: "a resident" });
    expect(view.youReceive).toEqual({ favor: "portrait_photo", label: "Portrait photo", from: "another resident" });
    expect(view.contacts).toEqual([]);
    expect(JSON.stringify(core.myLoops(ctx, C))).not.toContain("@");
  });

  test("three yeses accept the loop and reveal handles to neighbours only", () => {
    const { ctx, events, loopId } = village();
    expect(core.answer(ctx, A, loopId, "yes").loop.status).toBe("proposed");
    expect(core.answer(ctx, B, loopId, "yes").loop.waitingFor).toBe(1);
    const r = core.answer(ctx, C, loopId, "yes");
    expect(r.loop.status).toBe("accepted");
    expect(events.at(-1)).toEqual({ type: "accepted", loopId, notify: [A, C, B] });
    // C gives yoga to B and receives a code review from A.
    expect(r.loop.youGive?.to).toBe("@bob_tg");
    expect(r.loop.youReceive?.from).toBe("@alice_av");
    expect(r.loop.contacts).toContainEqual({ role: "you give to", handle: "@bob_tg" });
    // C shared no handle: A sees a placeholder, not a handle.
    const a = core.myLoops(ctx, A).loops[0];
    expect(a.youGive?.to).toBe("a resident");
    expect(a.contacts).toContainEqual({ role: "you give to", handle: null });
  });

  test("a no dissolves the loop, tells the others without naming anyone, and blocks re-proposal", () => {
    const { ctx, events, loopId } = village();
    core.answer(ctx, A, loopId, "yes");
    const r = core.answer(ctx, B, loopId, "no");
    expect(r.loop.status).toBe("dissolved");
    expect(events.find(e => e.type === "dissolved")).toEqual({ type: "dissolved", loopId, notify: [A, C] });
    expect(core.myLoops(ctx, A).loops[0].status).toBe("dissolved");
    expect(JSON.stringify(core.myLoops(ctx, A))).not.toContain(B);
    // The same three are free again, but the group is never proposed again.
    expect(core.runMatcher(ctx)).toEqual([]);
    expect(core.myLoops(ctx, C).loops.filter(l => l.status === "proposed")).toHaveLength(0);
  });

  test("only the receiver of a favor can confirm it", () => {
    const t = testCtx();
    // B before A: the matcher runs on every join, so A arriving last completes G -> A -> B at once.
    core.join(t.ctx, G, "tg", { offers: ["code_review"], giftOnly: true });
    core.join(t.ctx, B, "tg", { offers: ["goa_tips"], wants: ["portrait_photo"] });
    core.join(t.ctx, A, "tg", { offers: ["portrait_photo"], wants: ["code_review"] });
    const chain = core.myLoops(t.ctx, G).loops[0];
    expect(chain.shape).toBe("chain");
    expect(codeOf(() => core.confirm(t.ctx, A, chain.loopId, true))).toBe("conflict"); // not accepted yet
    for (const id of [G, A, B]) core.answer(t.ctx, id, chain.loopId, "yes");
    expect(codeOf(() => core.confirm(t.ctx, G, chain.loopId, true))).toBe("not_authorized"); // G only gives
    core.join(t.ctx, D, "av", { offers: ["music_lesson"], wants: ["cv_review"] });
    expect(codeOf(() => core.confirm(t.ctx, D, chain.loopId, true))).toBe("not_found"); // not in the loop
    expect(core.confirm(t.ctx, A, chain.loopId, true).loop.favorsConfirmed).toBe(1);
    // In a chain the giver and the last receiver are not neighbours: no handle crosses.
    expect(core.myLoops(t.ctx, G).loops[0].steps.map(s => s.to)).toEqual(["a resident", "another resident"]);
  });

  test("every receiver confirming completes the loop", () => {
    const { ctx, events, loopId } = village();
    for (const id of [A, B, C]) core.answer(ctx, id, loopId, "yes");
    core.confirm(ctx, A, loopId, true);
    core.confirm(ctx, B, loopId, false); // not yet
    core.confirm(ctx, B, loopId, true);
    const last = core.confirm(ctx, C, loopId, true);
    expect(last.loop.status).toBe("completed");
    expect(events.filter(e => e.type === "completed")).toEqual([{ type: "completed", loopId, notify: [A, C, B] }]);
    expect(core.board(ctx).counts).toEqual({ members: 3, loopsProposed: 1, loopsAccepted: 1, loopsCompleted: 1, favorsConfirmed: 3 });
  });

  test("proposals expire after 6 hours; whoever did not answer is paused", () => {
    const { ctx, events, advance, loopId } = village();
    core.answer(ctx, A, loopId, "yes");
    advance(PROPOSAL_TTL_MS + 1);
    expect(core.myLoops(ctx, A).loops[0].status).toBe("expired"); // shown before the timer writes it
    expect(core.expireDue(ctx)).toBe(1);
    expect(events.find(e => e.type === "expired")?.notify).toEqual([A, C, B]);
    expect(core.myLoops(ctx, B).member?.paused).toBe(true);
    expect(core.myLoops(ctx, A).member?.paused).toBe(false);
    expect(codeOf(() => core.answer(ctx, C, loopId, "yes"))).toBe("expired");
  });

  test("answering an overdue proposal expires it and keeps the caller in the pool", () => {
    const { ctx, advance, loopId } = village();
    advance(PROPOSAL_TTL_MS);
    expect(codeOf(() => core.answer(ctx, A, loopId, "yes"))).toBe("expired");
    expect(core.myLoops(ctx, A).member?.paused).toBe(false);
    expect(core.myLoops(ctx, B).member?.paused).toBe(true);
  });

  test("a late no, before the timer runs, still blocks the group and does not pause or notify the caller", () => {
    const t = testCtx();
    core.join(t.ctx, A, "tg", { offers: ["code_review"], wants: ["portrait_photo"] });
    core.join(t.ctx, B, "tg", { offers: ["portrait_photo"], wants: ["code_review"] });
    const loopId = core.myLoops(t.ctx, A).loops[0].loopId;
    core.answer(t.ctx, A, loopId, "yes");
    t.advance(PROPOSAL_TTL_MS + 1);
    expect(codeOf(() => core.answer(t.ctx, B, loopId, "no"))).toBe("expired");
    expect(t.events.find(e => e.type === "expired")?.notify).toEqual([A]);
    expect(core.myLoops(t.ctx, B).member?.paused).toBe(false);
    expect(core.myLoops(t.ctx, B).loops.filter(l => l.status === "proposed")).toHaveLength(0); // not re-proposed
    expect(core.runMatcher(t.ctx)).toEqual([]);
  });

  test("a late no after the timer ran also blocks the group, even once the caller resumes", () => {
    const t = testCtx();
    core.join(t.ctx, A, "tg", { offers: ["code_review"], wants: ["portrait_photo"] });
    core.join(t.ctx, B, "tg", { offers: ["portrait_photo"], wants: ["code_review"] });
    const loopId = core.myLoops(t.ctx, A).loops[0].loopId;
    t.advance(PROPOSAL_TTL_MS + 1);
    core.expireDue(t.ctx);
    expect(codeOf(() => core.answer(t.ctx, B, loopId, "no"))).toBe("expired");
    core.resume(t.ctx, A);
    expect(core.runMatcher(t.ctx)).toEqual([]);
    expect(core.myLoops(t.ctx, B).member?.paused).toBe(false);
  });

  test("a loop accepted a day ago no longer keeps its members out of new loops, and can still complete", () => {
    const t = testCtx();
    core.join(t.ctx, A, "tg", { offers: ["code_review"], wants: ["portrait_photo"] });
    core.join(t.ctx, B, "tg", { offers: ["portrait_photo"], wants: ["code_review"] });
    const first = core.myLoops(t.ctx, A).loops[0].loopId;
    core.answer(t.ctx, A, first, "yes");
    core.answer(t.ctx, B, first, "yes");
    core.join(t.ctx, D, "tg", { offers: ["portrait_photo"], wants: ["code_review"] });
    expect(core.myLoops(t.ctx, D).loops).toHaveLength(0); // A is busy
    t.advance(STALE_ACCEPTED_MS + 1);
    expect(core.runMatcher(t.ctx).map(c => c.members.sort())).toEqual([[A, D].sort()]);
    core.confirm(t.ctx, A, first, true);
    expect(core.confirm(t.ctx, B, first, true).loop.status).toBe("completed");
  });

  test("receivers who have not confirmed get one reminder 12 hours after acceptance", () => {
    const { ctx, events, advance, loopId } = village();
    for (const id of [A, B, C]) core.answer(ctx, id, loopId, "yes");
    core.confirm(ctx, A, loopId, true);
    advance(REMIND_AFTER_MS + 1);
    core.expireDue(ctx);
    core.expireDue(ctx);
    expect(events.filter(e => e.type === "remind")).toEqual([{ type: "remind", loopId, notify: [C, B] }]);
  });

  test("a loop id that does not include you is not found", () => {
    const { ctx, loopId } = village();
    core.join(ctx, D, "av", { offers: ["music_lesson"], wants: ["cv_review"] });
    expect(codeOf(() => core.answer(ctx, D, loopId, "yes"))).toBe("not_found");
    expect(codeOf(() => core.answer(ctx, "f".repeat(64), loopId, "yes"))).toBe("not_found");
  });

  test("leave deletes the member, dissolves open loops and keeps past counts", () => {
    const { ctx, events, loopId } = village();
    for (const id of [A, B, C]) core.answer(ctx, id, loopId, "yes");
    for (const id of [A, B, C]) core.confirm(ctx, id, loopId, true);
    expect(core.myLoops(ctx, A).member?.wants).toEqual([]); // received, so no longer wanted
    core.join(ctx, A, "av", { offers: ["code_review"], wants: ["music_lesson"] });
    core.join(ctx, D, "av", { offers: ["music_lesson"], wants: ["code_review"] }); // swaps with A
    const swap = core.myLoops(ctx, D).loops[0];
    expect(swap.shape).toBe("swap");
    const r = core.leave(ctx, A);
    expect(r.deleted).toBe(true);
    expect(events.at(-1)).toEqual({ type: "dissolved", loopId: swap.loopId, notify: [D] });
    expect(core.isMember(ctx, A)).toBe(false);
    expect(core.myLoops(ctx, A).joined).toBe(false);
    const dump = JSON.stringify(ctx.db.query("SELECT * FROM seats").all()) + JSON.stringify(ctx.db.query("SELECT * FROM edges").all());
    expect(dump).not.toContain(A);
    expect(core.board(ctx).counts.loopsCompleted).toBe(1);
    expect(core.leave(ctx, A).deleted).toBe(false);
  });

  test("the board never carries members or handles", () => {
    const { ctx, loopId } = village();
    for (const id of [A, B, C]) core.answer(ctx, id, loopId, "yes");
    const text = JSON.stringify(core.board(ctx, 20)) + JSON.stringify(core.boardGraph(ctx, makeIdentity("test").anon));
    for (const secret of [A, B, C, "@alice_av", "@bob_tg"]) expect(text).not.toContain(secret);
    expect(core.board(ctx).recentLoops).toEqual([{ shape: "loop3", favors: ["code_review", "stretch_session", "portrait_photo"], status: "accepted" }]);
  });
});
