import { describe, expect, test } from "bun:test";
import type { UserFromGetMe } from "grammy/types";
import { parseAgentReply } from "../src/agent-reply";
import { createBot } from "../src/bot";
import * as core from "../src/core";
import { makeIdentity, makeSealer } from "../src/identity";
import { FAVOR_IDS } from "../src/menu";
import { SimVillage } from "../src/sim";
import { testCtx } from "./helpers";

type Call = { method: string; payload: any };
const BOT_INFO = {
  id: 42, is_bot: true, first_name: "Favor Loop", username: "favorloop_test_bot", can_join_groups: false,
  can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
} as UserFromGetMe;

/** A bot wired to an in-memory village, with every Telegram API call recorded instead of sent. */
function harness(failing: Set<string> = new Set()) {
  const t = testCtx();
  const calls: Call[] = [];
  const identity = makeIdentity("bot-test");
  const { bot, onLoopEvent } = createBot({
    token: "123456:TEST", ctx: t.ctx, identity, sealer: makeSealer("bot-test"), sim: new SimVillage(1),
    publicBaseUrl: "https://favorloop.example.org", adminIds: new Set(["999"]), log: () => {},
  }, BOT_INFO);
  const record = t.ctx.emit;
  t.ctx.emit = e => { record(e); onLoopEvent(e); };
  bot.api.config.use(async (_prev, method, payload: any) => {
    calls.push({ method, payload });
    if (failing.has(method)) throw new Error(`${method} refused`);
    const message = { message_id: calls.length, date: 0, chat: { id: payload?.chat_id ?? 0, type: "private" }, text: "" };
    return { ok: true, result: method === "sendMessage" ? message : true } as any;
  });
  let n = 0;
  const user = (id: number, username?: string) => ({ id, is_bot: false, first_name: `R${id}`, ...(username ? { username } : {}) });
  const chat = (from: { id: number; first_name: string }) => ({ id: from.id, type: "private" as const, first_name: from.first_name });
  const say = (from: ReturnType<typeof user>, text: string, extra: Record<string, unknown> = {}) => bot.handleUpdate({
    update_id: ++n,
    message: {
      message_id: n, date: 0, chat: chat(from), from, text, ...extra,
      ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {}),
    },
  } as any);
  const tap = (from: ReturnType<typeof user>, data: string) => bot.handleUpdate({
    update_id: ++n,
    callback_query: { id: String(n), from, chat_instance: "c", data, message: { message_id: 1, date: 0, chat: chat(from), text: "menu" } },
  } as any);
  const sentTo = (chatId: number) => calls.filter(c => c.method === "sendMessage" && c.payload.chat_id === chatId).map(c => String(c.payload.text));
  const buttons = (call: Call) => (call.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data);
  const idx = (id: string) => FAVOR_IDS.indexOf(id);
  async function joinWithButtons(from: ReturnType<typeof user>, offers: string[], wants: string[], share = true) {
    await say(from, "/start");
    await tap(from, "agree");
    await tap(from, "pick");
    for (const o of offers) await tap(from, `o:${idx(o)}`);
    await tap(from, "nav:wants");
    for (const w of wants) await tap(from, `w:${idx(w)}`);
    await tap(from, "nav:slots");
    await tap(from, "nav:handle");
    await tap(from, share ? "h:1" : "h:0");
    await tap(from, "nav:review");
    await tap(from, "join");
  }
  return { ...t, calls, identity, user, say, tap, sentTo, buttons, joinWithButtons };
}

describe("agent replies", () => {
  test("reads the two lines, ignoring Markdown and unknown words", () => {
    expect(parseAgentReply("OFFERS: code_review, goa_tips\nWANTS: portrait_photo")).toEqual({ offers: ["code_review", "goa_tips"], wants: ["portrait_photo"] });
    expect(parseAgentReply("Sure!\n**OFFERS:** `code_review`, massage\n- WANTS: code_review, ai_tool_setup, cv_review, music_lesson"))
      .toEqual({ offers: ["code_review"], wants: ["ai_tool_setup", "cv_review", "music_lesson"] });
    expect(parseAgentReply("hello there")).toBeNull();
  });
});

describe("telegram bot", () => {
  test("/start shows the consent text with an I agree button", async () => {
    const h = harness();
    await h.say(h.user(1), "/start");
    const first = h.calls.find(c => c.method === "sendMessage")!;
    expect(first.payload.text).toContain("Favor Loop stores only the favors you pick");
    expect(first.payload.text).toContain("All data is deleted on 30 Nov 2026");
    expect(h.buttons(first)).toEqual(["agree"]);
  });

  test("three residents join with buttons, get the loop, say yes, confirm and complete it", async () => {
    const h = harness();
    const [a, b, c] = [h.user(101, "alice_tg"), h.user(102, "bobby_tg"), h.user(103)];
    await h.joinWithButtons(a, ["code_review"], ["portrait_photo"]);
    await h.joinWithButtons(b, ["portrait_photo"], ["stretch_session"]);
    expect(h.sentTo(101).some(t => t.includes("A favor loop for you"))).toBe(false);
    await h.joinWithButtons(c, ["stretch_session"], ["code_review"], false);
    for (const id of [101, 102, 103]) expect(h.sentTo(id).filter(t => t.includes("A favor loop for you"))).toHaveLength(1);
    expect(h.sentTo(101).join("\n")).not.toContain("@bobby_tg"); // hidden until everyone says yes

    const proposal = h.calls.find(x => x.payload.chat_id === 103 && String(x.payload.text).includes("A favor loop"))!;
    const yes = h.buttons(proposal).find((d: string) => d.endsWith(":y"))!;
    const loopId = yes.split(":")[1];
    for (const u of [a, b, c]) await h.tap(u, `a:${loopId}:y`);
    const accepted = h.sentTo(103).find(t => t.includes("Everyone said yes"))!;
    expect(accepted).toContain("@bobby_tg"); // C gives yoga to B
    expect(accepted).toContain("@alice_tg"); // and receives a code review from A
    expect(h.sentTo(102).find(t => t.includes("Everyone said yes"))).toContain("(no Telegram handle shared)");

    for (const u of [a, b, c]) await h.tap(u, `c:${loopId}`);
    for (const id of [101, 102, 103]) expect(h.sentTo(id).some(t => t.includes("Loop complete!") && t.includes("/board"))).toBe(true);
    expect(core.board(h.ctx).counts.loopsCompleted).toBe(1);
  });

  test("chat ids are stored sealed, and /leave deletes everything", async () => {
    const h = harness();
    const a = h.user(5551234, "alice_tg");
    await h.joinWithButtons(a, ["code_review"], ["portrait_photo"]);
    const member = h.identity.forTelegram(5551234);
    expect(core.isMember(h.ctx, member)).toBe(true);
    const dump = JSON.stringify(h.ctx.db.query("SELECT * FROM tg_routes").all()) + JSON.stringify(h.ctx.db.query("SELECT * FROM members").all());
    expect(dump).not.toContain("5551234");
    await h.say(a, "/leave");
    await h.tap(a, "leave:yes");
    expect(core.isMember(h.ctx, member)).toBe(false);
    expect(h.ctx.db.query("SELECT COUNT(*) AS n FROM tg_routes").get()).toEqual({ n: 0 });
  });

  test("an agent's forwarded answer pre-selects the favors, labelled as the agent's", async () => {
    const h = harness();
    const a = h.user(7);
    await h.say(a, "/start");
    await h.tap(a, "agree");
    await h.tap(a, "agent");
    expect(h.sentTo(7).at(-1)).toContain("OFFERS: id, id");
    await h.say(a, "OFFERS: code_review, proofreading\nWANTS: portrait_photo", {
      forward_origin: { type: "user", date: 0, sender_user: { id: 9, is_bot: true, first_name: "My agent" } },
    });
    const screen = h.calls.filter(c => c.method === "sendMessage").at(-1)!;
    expect(screen.payload.text).toContain("Suggested by your agent");
    const marked = (screen.payload.reply_markup.inline_keyboard as any[]).flat().filter((b: any) => b.text.startsWith("✅")).map((b: any) => b.callback_data);
    expect(marked).toEqual([`o:${FAVOR_IDS.indexOf("code_review")}`, `o:${FAVOR_IDS.indexOf("proofreading")}`]);
  });

  test("a report asks first, and sends the username only when the resident chooses to", async () => {
    const h = harness();
    const a = h.user(21, "private_alice");
    await h.say(a, "/report my partner never showed up");
    expect(h.sentTo(999)).toHaveLength(0); // nothing sent yet
    const ask = h.calls.filter(c => c.method === "sendMessage" && c.payload.chat_id === 21).at(-1)!;
    expect(h.buttons(ask)).toEqual(["rep:with", "rep:anon", "rep:no"]);
    await h.tap(a, "rep:anon");
    expect(h.sentTo(999).at(-1)).toContain("my partner never showed up");
    expect(h.sentTo(999).at(-1)).not.toContain("private_alice");
    await h.say(a, "/report second time");
    await h.tap(a, "rep:with");
    expect(h.sentTo(999).at(-1)).toContain("@private_alice");
  });

  test("Telegram refusing the callback answer never undoes a join or skips a deletion", async () => {
    const h = harness(new Set(["answerCallbackQuery"]));
    const a = h.user(31, "alice_tg");
    await h.joinWithButtons(a, ["code_review"], ["portrait_photo"]);
    const member = h.identity.forTelegram(31);
    expect(core.isMember(h.ctx, member)).toBe(true);
    expect(h.ctx.db.query("SELECT COUNT(*) AS n FROM tg_routes WHERE member_id = ?").get(member)).toEqual({ n: 1 });
    await h.say(a, "/leave");
    await h.tap(a, "leave:yes");
    expect(core.isMember(h.ctx, member)).toBe(false);
  });

  test("only organisers can see /stats; a no is never named", async () => {
    const h = harness();
    await h.say(h.user(1), "/stats");
    expect(h.sentTo(1).at(-1)).toBe("That command is for organisers.");
    await h.say(h.user(999), "/stats");
    expect(h.sentTo(999).at(-1)).toContain("Simulated (never counted as real)");
    const [a, b] = [h.user(11, "alice_tg"), h.user(12, "bobby_tg")];
    await h.joinWithButtons(a, ["code_review"], ["portrait_photo"]);
    await h.joinWithButtons(b, ["portrait_photo"], ["code_review"]);
    const loopId = core.myLoops(h.ctx, h.identity.forTelegram(11)).loops[0].loopId;
    await h.tap(b, `a:${loopId}:n`);
    const told = h.sentTo(11).at(-1)!;
    expect(told).toContain("did not go ahead");
    expect(told).not.toContain("bobby");
  });
});
