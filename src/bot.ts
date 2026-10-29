// The Favor Loop Telegram bot (grammY, long polling), what residents use this week. It calls the same core
// as the MCP tools. Drafts live in memory only; a member is written when they tap "Join".
import { Bot, GrammyError, InlineKeyboard, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { parseAgentReply } from "./agent-reply";
import { AGENT_PROMPT, PITCH, SAFETY, TELEGRAM_CONSENT } from "./content";
import * as core from "./core";
import { AppError, istTime, MEETING_PLACE, type Ctx, type LoopEvent, type LoopView } from "./core";
import type { Identity, Sealer } from "./identity";
import { FAVORS, favorEmoji, favorLabel, listLabels, SLOTS, slotLabel } from "./menu";
import type { SimVillage } from "./sim";

export type BotDeps = {
  token: string;
  ctx: Ctx;
  identity: Identity;
  sealer: Sealer;
  sim: SimVillage;
  publicBaseUrl: string;
  adminIds: ReadonlySet<string>;
  log: (line: Record<string, unknown>) => void;
};

type Step = "offers" | "wants" | "slots" | "handle" | "review";
type Draft = {
  step: Step;
  offers: string[];
  wants: string[];
  giftOnly: boolean;
  availability: string[];
  shareHandle: boolean;
  awaitingAgent: boolean;
  suggestedBy: "agent" | "paste" | null;
  touched: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SHAPE_TITLE: Record<string, string> = { loop3: "A favor loop for you!", chain: "A gift chain for you!", swap: "A favor swap for you!" };

/** "💻 You give Code review → a resident" */
export function stepLines(v: LoopView): string {
  return v.steps
    .map(s => `${favorEmoji(s.favor)} ${s.from === "you" ? "You give" : `${cap(esc(s.from))} gives`} <b>${esc(favorLabel(s.favor))}</b> → ${esc(s.to)}`)
    .join("\n");
}

export function proposalMessage(v: LoopView): { text: string; keyboard: InlineKeyboard | undefined } {
  if (v.status !== "proposed") return acceptedMessage(v);
  const people = v.steps.length + (v.shape === "chain" ? 1 : 0);
  const lines = [
    `🔁 <b>${SHAPE_TITLE[v.shape]}</b>`,
    "",
    stepLines(v),
    "",
    `🕐 ${esc(v.window)} · ${MEETING_PLACE}`,
    `It starts only if all ${people} say yes. A no is never shown to the others.`,
  ];
  if (v.yourAnswer === "yes") {
    lines.push(`You said yes. Waiting for ${v.waitingFor} more.`);
    return { text: lines.join("\n"), keyboard: undefined };
  }
  lines.push(`Please answer by ${istTime(Date.parse(v.answerBy!))}.`);
  return { text: lines.join("\n"), keyboard: new InlineKeyboard().text("✅ Yes", `a:${v.loopId}:y`).text("❌ No", `a:${v.loopId}:n`) };
}

export function acceptedMessage(v: LoopView): { text: string; keyboard: InlineKeyboard | undefined } {
  const who = (name: string) => (name.startsWith("@") ? name : `${name} (no Telegram handle shared)`);
  const lines = [v.status === "completed" ? "💫 <b>Loop complete!</b>" : "🎉 <b>Everyone said yes!</b>", ""];
  if (v.youGive) lines.push(`${favorEmoji(v.youGive.favor)} You give <b>${esc(v.youGive.label)}</b> to ${esc(who(v.youGive.to))}.`);
  if (v.youReceive) lines.push(`${favorEmoji(v.youReceive.favor)} You receive <b>${esc(v.youReceive.label)}</b> from ${esc(who(v.youReceive.from))}.`);
  lines.push("", `🕐 ${esc(v.window)} · ${MEETING_PLACE}. About 15 minutes, free.`);
  let keyboard: InlineKeyboard | undefined;
  if (v.status === "accepted") {
    if (v.youReceive && !v.youReceived) {
      lines.push("When you have received your favor, tap the button.");
      keyboard = new InlineKeyboard().text("I received it ✅", `c:${v.loopId}`);
    } else if (v.youReceive) {
      lines.push(`You confirmed yours. ${v.favorsConfirmed} of ${v.favorsTotal} favors done.`);
    } else {
      lines.push("You only give in this chain. Thank you!");
    }
  } else {
    lines.push(`All ${v.favorsTotal} favors happened and were confirmed.`);
  }
  return { text: lines.join("\n"), keyboard };
}

/** Builds the bot and its handlers without touching the network (tests pass botInfo). */
export function createBot(deps: BotDeps, botInfo?: UserFromGetMe) {
  const { ctx: village, identity, sealer, log } = deps;
  const bot = new Bot(deps.token, botInfo ? { botInfo } : undefined);
  const drafts = new Map<number, Draft>();
  const agreed = new Set<number>();
  const memberOf = (userId: number) => identity.forTelegram(userId);
  const boardUrl = `${deps.publicBaseUrl}/board`;
  const reports = new Map<number, { text: string; at: number }>();
  /** Telegram refuses late or repeated callback answers ("query is too old"); that must never undo any work. */
  const ack = (c: Context, other?: Parameters<Context["answerCallbackQuery"]>[0]) => c.answerCallbackQuery(other).then(() => {}, () => {});

  // ---------------------------------------------------------------- routes (sealed chat ids)
  const remember = (memberId: string, chatId: number) =>
    village.db.query("INSERT INTO tg_routes (member_id, sealed) VALUES (?, ?) ON CONFLICT (member_id) DO UPDATE SET sealed = excluded.sealed")
      .run(memberId, sealer.seal(String(chatId)));
  const chatOf = (memberId: string): number | null => {
    const row = village.db.query<{ sealed: string }, [string]>("SELECT sealed FROM tg_routes WHERE member_id = ?").get(memberId);
    const plain = row ? sealer.open(row.sealed) : null;
    return plain ? Number(plain) : null;
  };

  async function send(chatId: number, text: string, keyboard?: InlineKeyboard) {
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: keyboard, link_preview_options: { is_disabled: true } });
    } catch (e) {
      log({ event: "bot_send", error: e instanceof GrammyError ? e.error_code : "network" });
    }
  }

  // ---------------------------------------------------------------- loop events -> messages
  function onLoopEvent(event: LoopEvent) {
    for (const memberId of event.notify) {
      const chatId = chatOf(memberId);
      if (chatId === null) continue; // an Agent Village member, or someone who left
      const view = core.loopSummaryFor(village, event.loopId, memberId);
      if (!view) continue;
      switch (event.type) {
        case "proposed": {
          const m = proposalMessage(view);
          void send(chatId, m.text, m.keyboard);
          break;
        }
        case "accepted": {
          const m = acceptedMessage(view);
          void send(chatId, m.text, m.keyboard);
          break;
        }
        case "dissolved":
          void send(chatId, "That loop did not go ahead. You are back in the pool, and I will look for another one.");
          break;
        case "expired": {
          const paused = core.getMemberView(village, memberId)?.paused;
          if (paused) {
            void send(chatId, "A loop proposal expired without your answer, so I paused your matching. Tap Resume when you are ready.",
              new InlineKeyboard().text("▶️ Resume", "resume"));
          } else {
            void send(chatId, "That loop expired because not everyone answered within 6 hours. You are back in the pool.");
          }
          break;
        }
        case "confirmed":
          void send(chatId, "🙏 The person you helped confirmed your favor. Thank you!");
          break;
        case "completed":
          void send(chatId, `💫 <b>Loop complete!</b> All ${view.favorsTotal} favors happened and were confirmed.\nWatch it light up on the board: ${boardUrl}`);
          break;
        case "remind":
          if (view.status === "accepted" && view.youReceive && !view.youReceived) {
            void send(chatId, `⏰ Did you receive <b>${esc(view.youReceive.label)}</b> from ${esc(view.youReceive.from)}? When you have, tap the button, so the loop can close.`,
              new InlineKeyboard().text("I received it ✅", `c:${view.loopId}`));
          }
          break;
      }
    }
  }

  // ---------------------------------------------------------------- the join draft
  const newDraft = (userId: number): Draft => {
    const current = core.getMemberView(village, memberOf(userId));
    const draft: Draft = {
      step: "offers",
      offers: current ? [...current.offers] : [],
      wants: current ? [...current.wants] : [],
      giftOnly: current?.giftOnly ?? false,
      availability: current ? [...current.availability] : [],
      shareHandle: current ? current.contactHandle !== null : true,
      awaitingAgent: false,
      suggestedBy: null,
      touched: Date.now(),
    };
    drafts.set(userId, draft);
    return draft;
  };

  function screen(draft: Draft, username: string | undefined): { text: string; keyboard: InlineKeyboard } {
    const kb = new InlineKeyboard();
    const favorButtons = (selected: string[], prefix: string, disabled: string[] = []) => {
      FAVORS.forEach((f, i) => {
        const mark = selected.includes(f.id) ? "✅ " : disabled.includes(f.id) ? "· " : "";
        kb.text(`${mark}${f.emoji} ${f.short}`, `${prefix}:${i}`);
        if (i % 2 === 1) kb.row();
      });
    };
    const note = draft.suggestedBy === "agent" ? "✨ <i>Suggested by your agent: check and edit, you decide.</i>\n\n"
      : draft.suggestedBy === "paste" ? "✨ <i>Read from your message: check and edit, you decide.</i>\n\n" : "";
    switch (draft.step) {
      case "offers":
        favorButtons(draft.offers, "o");
        kb.text("Next →", "nav:wants");
        return { text: `${note}<b>Step 1 of 4: what can you give?</b>\nPick 1 to 3 favors you could do for someone in about 15 minutes.`, keyboard: kb };
      case "wants":
        if (!draft.giftOnly) favorButtons(draft.wants, "w", draft.offers);
        kb.text(draft.giftOnly ? "✅ 🎁 I only want to give" : "🎁 I only want to give", "g").row();
        kb.text("← Back", "nav:offers").text("Next →", "nav:slots");
        return {
          text: `${note}<b>Step 2 of 4: what would you like?</b>\n${draft.giftOnly ? "You only want to give: your favor can start a gift chain." : "Pick 1 to 3 favors you would like to receive, or tick 'I only want to give'."}`,
          keyboard: kb,
        };
      case "slots":
        SLOTS.forEach((s, i) => kb.text(`${draft.availability.includes(s.id) ? "✅ " : ""}${s.label}`, `s:${i}`).row());
        kb.text("← Back", "nav:wants").text("Next →", "nav:handle");
        return { text: "<b>Step 3 of 4: when are you around?</b>\nOptional. Pick any that suit you, or just tap Next.", keyboard: kb };
      case "handle":
        if (username) {
          kb.text(`${draft.shareHandle ? "✅ " : ""}Yes, share @${username}`, "h:1").row();
          kb.text(`${draft.shareHandle ? "" : "✅ "}No, keep it private`, "h:0").row();
        }
        kb.text("← Back", "nav:slots").text("Next →", "nav:review");
        return {
          text: username
            ? `<b>Step 4 of 4: your Telegram handle</b>\nShare @${esc(username)} with your loop partners once everyone says yes? Only the people you give to and receive from see it.`
            : "<b>Step 4 of 4: your Telegram handle</b>\nYou have no Telegram username, so partners cannot message you directly. You can still meet them at The Circle. To share one later, set a username in Telegram and change your favors here.",
          keyboard: kb,
        };
      case "review": {
        kb.text("✅ Join Favor Loop", "join").row().text("✏️ Edit", "nav:offers");
        const handle = username && draft.shareHandle ? `@${esc(username)}, shown only to your loop partners after everyone says yes` : "not shared";
        return {
          text: [
            "<b>Ready?</b>",
            `You give: ${esc(listLabels(draft.offers))}`,
            draft.giftOnly ? "You only want to give 🎁" : `You would like: ${esc(listLabels(draft.wants))}`,
            `When: ${draft.availability.length ? esc(listLabels(draft.availability, slotLabel)) : "any time"}`,
            `Handle: ${handle}`,
            "",
            "<i>Favors are free, about 15 minutes, in a public place or online. You can say no or /leave at any time.</i>",
          ].join("\n"),
          keyboard: kb,
        };
      }
    }
  }

  async function show(c: Context, draft: Draft, edit: boolean) {
    const { text, keyboard } = screen(draft, c.from?.username);
    if (edit) {
      try {
        await c.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        return;
      } catch (e) {
        if (e instanceof GrammyError && e.description.includes("message is not modified")) return;
      }
    }
    await c.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }

  const pm = bot.chatType("private");

  async function sendConsent(c: Context) {
    const kb = new InlineKeyboard().text("I agree", "agree");
    await c.reply(
      [
        `🔁 <b>Favor Loop</b>: ${PITCH}`,
        "",
        "Pick 15-minute favors you can give and would like. I look for swaps, three-way loops (A helps B, B helps C, C helps A) and gift chains. A loop starts only when everyone says yes, and whoever receives a favor confirms it.",
        "",
        ...TELEGRAM_CONSENT.map(line => `• ${esc(line)}`),
        "",
        ...SAFETY.map(line => `• ${esc(line)}`),
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: kb },
    );
  }

  async function sendStatus(c: Context, userId: number) {
    const memberId = memberOf(userId);
    const mine = core.myLoops(village, memberId);
    if (!mine.joined || !mine.member) {
      await sendConsent(c);
      return;
    }
    const m = mine.member;
    const lines = [
      "<b>Your Favor Loop</b>",
      `You give: ${esc(listLabels(m.offers))}`,
      m.giftOnly ? "You only want to give 🎁" : `You would like: ${m.wants.length ? esc(listLabels(m.wants)) : "nothing right now (change your favors to add some)"}`,
      `When: ${m.availability.length ? esc(listLabels(m.availability, slotLabel)) : "any time"}`,
      `Handle: ${m.contactHandle ? `${esc(m.contactHandle)} (shared after everyone says yes)` : "not shared"}`,
      "",
      esc(mine.text),
    ];
    const kb = new InlineKeyboard().text("✏️ Change my favors", "edit");
    if (m.paused) kb.text("▶️ Resume", "resume");
    await c.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
    for (const loop of mine.loops.filter(l => l.status === "proposed" || l.status === "accepted")) {
      const msg = loop.status === "proposed" ? proposalMessage(loop) : acceptedMessage(loop);
      await c.reply(msg.text, { parse_mode: "HTML", reply_markup: msg.keyboard });
    }
  }

  // ---------------------------------------------------------------- commands
  pm.command("start", async c => {
    if (core.isMember(village, memberOf(c.from.id))) await sendStatus(c, c.from.id);
    else await sendConsent(c);
  });
  pm.command("status", c => sendStatus(c, c.from.id));
  pm.command("join", async c => {
    if (!agreed.has(c.from.id) && !core.isMember(village, memberOf(c.from.id))) return sendConsent(c);
    await chooseMode(c);
  });
  pm.command("help", c =>
    c.reply(
      [
        "<b>Favor Loop commands</b>",
        "/status: your favors and loops",
        "/join: choose or change your favors",
        "/resume: get back in the pool after a pause",
        "/leave: delete everything Favor Loop holds about you",
        "/report: tell an organiser about a problem, e.g. <code>/report the person never showed up</code>",
        "",
        ...SAFETY.map(line => `• ${esc(line)}`),
        "",
        `Board: ${boardUrl}`,
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    ));
  pm.command("leave", c =>
    c.reply("This deletes everything Favor Loop holds about you and cancels your open loops. Are you sure?", {
      reply_markup: new InlineKeyboard().text("🗑 Delete everything", "leave:yes").text("Cancel", "leave:no"),
    }));
  pm.command("resume", async c => {
    const changed = core.resume(village, memberOf(c.from.id));
    await c.reply(changed ? "You are back in the pool. I will message you when I find a loop." : "Your matching is not paused.");
  });
  // A report goes to the organisers only after the resident chooses whether their username goes with it.
  pm.command("report", async c => {
    const text = c.match.trim();
    if (!text) return c.reply("Tell me what happened after the command, for example: /report the person never showed up");
    if (deps.adminIds.size === 0) return c.reply("Reports are not set up yet. Please find an organiser in the village.");
    reports.set(c.from.id, { text: text.slice(0, 1500), at: Date.now() });
    const kb = new InlineKeyboard();
    if (c.from.username) kb.text(`Send with @${c.from.username}, so they can reply`, "rep:with").row();
    kb.text(c.from.username ? "Send without my username" : "Send", "rep:anon").row().text("Cancel", "rep:no");
    await c.reply(
      `Send this to an organiser?\n\n${text.slice(0, 1500)}${c.from.username ? "" : "\n\nYou have no Telegram username, so an organiser cannot reply to you here; find them in the village if you want to talk."}`,
      { reply_markup: kb },
    );
  });
  pm.callbackQuery(/^rep:(with|anon|no)$/, async c => {
    await ack(c);
    await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const report = reports.get(c.from.id);
    reports.delete(c.from.id);
    if (c.match[1] === "no" || !report) return c.reply(report ? "Not sent." : "That report has expired. Send /report again.");
    const from = c.match[1] === "with" && c.from.username ? `@${c.from.username}` : "a resident who chose not to share their username";
    for (const admin of deps.adminIds) await send(Number(admin), `🚩 <b>Favor Loop report</b> from ${esc(from)}:\n${esc(report.text)}`);
    await c.reply("Thanks, an organiser will look at it.");
  });
  pm.command("stats", async c => {
    if (!deps.adminIds.has(String(c.from.id))) return c.reply("That command is for organisers.");
    const s = core.stats(village);
    const sim = core.counts(deps.sim.ctx);
    await c.reply(
      [
        "<b>Real</b>",
        `Members: ${s.members} (${s.bySource.map(r => `${r.source} ${r.n}`).join(", ") || "none"}), paused ${s.paused}`,
        `Loops: ${s.byStatus.map(r => `${r.status} ${r.n}`).join(", ") || "none"}`,
        `Favors confirmed: ${s.favorsConfirmed}`,
        "",
        "<b>Simulated (never counted as real)</b>",
        `Members ${sim.members}, loops ${sim.loopsProposed}, completed ${sim.loopsCompleted}`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  async function chooseMode(c: Context) {
    await c.reply("How would you like to choose your favors?", {
      reply_markup: new InlineKeyboard().text("📋 Pick from the menu", "pick").row().text("🤖 Ask my agent", "agent"),
    });
  }

  // ---------------------------------------------------------------- buttons
  pm.callbackQuery("agree", async c => {
    agreed.add(c.from.id);
    await ack(c);
    await chooseMode(c);
  });
  pm.callbackQuery("edit", async c => {
    await ack(c);
    await chooseMode(c);
  });
  pm.callbackQuery("pick", async c => {
    await ack(c);
    await show(c, newDraft(c.from.id), false);
  });
  pm.callbackQuery("agent", async c => {
    await ack(c);
    const draft = newDraft(c.from.id);
    draft.awaitingAgent = true;
    await c.reply(
      `🤖 <b>Ask your Agent Village agent</b>\nSend your agent this message (tap it to copy):\n\n<pre>${esc(AGENT_PROMPT)}</pre>\n\nThen forward its answer to me, or paste it here. I will pre-select the favors, and you decide.`,
      { parse_mode: "HTML" },
    );
  });

  const draftFor = async (c: Context): Promise<Draft | null> => {
    const draft = c.from ? drafts.get(c.from.id) : undefined;
    if (!draft) {
      await ack(c, { text: "That menu has expired. Send /join to start again.", show_alert: true });
      return null;
    }
    draft.touched = Date.now();
    return draft;
  };
  const toggle = (items: string[], id: string) => (items.includes(id) ? items.filter(x => x !== id) : [...items, id]);

  pm.callbackQuery(/^o:(\d+)$/, async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    const id = FAVORS[Number(c.match[1])]?.id;
    if (!id) return ack(c);
    if (!draft.offers.includes(id) && draft.offers.length >= 3) return ack(c, { text: "Pick at most 3.", show_alert: true });
    draft.offers = toggle(draft.offers, id);
    draft.wants = draft.wants.filter(w => w !== id);
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery(/^w:(\d+)$/, async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    const id = FAVORS[Number(c.match[1])]?.id;
    if (!id) return ack(c);
    if (draft.offers.includes(id)) return ack(c, { text: "You offer that one, so it cannot be a want too.", show_alert: true });
    if (!draft.wants.includes(id) && draft.wants.length >= 3) return ack(c, { text: "Pick at most 3.", show_alert: true });
    draft.wants = toggle(draft.wants, id);
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery("g", async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    draft.giftOnly = !draft.giftOnly;
    if (draft.giftOnly) draft.wants = [];
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery(/^s:(\d+)$/, async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    const id = SLOTS[Number(c.match[1])]?.id;
    if (id) draft.availability = toggle(draft.availability, id);
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery(/^h:([01])$/, async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    draft.shareHandle = c.match[1] === "1";
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery(/^nav:(offers|wants|slots|handle|review)$/, async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    const to = c.match[1] as Step;
    if (to !== "offers" && (draft.offers.length < 1 || draft.offers.length > 3)) {
      return ack(c, { text: "Pick 1 to 3 favors you can give first.", show_alert: true });
    }
    if ((to === "slots" || to === "handle" || to === "review") && !draft.giftOnly && draft.wants.length < 1) {
      return ack(c, { text: "Pick at least one favor you would like, or tick 'I only want to give'.", show_alert: true });
    }
    draft.step = to;
    await ack(c);
    await show(c, draft, true);
  });
  pm.callbackQuery("join", async c => {
    const draft = await draftFor(c);
    if (!draft) return;
    const memberId = memberOf(c.from.id);
    const username = c.from.username;
    const wasMember = core.isMember(village, memberId);
    remember(memberId, c.chat.id); // before joining, so a loop proposed at once reaches this chat
    let result: ReturnType<typeof core.join>;
    try {
      result = core.join(village, memberId, "tg", {
        offers: draft.offers,
        wants: draft.giftOnly ? [] : draft.wants,
        giftOnly: draft.giftOnly,
        availability: draft.availability,
        ...(username && draft.shareHandle && /^[A-Za-z0-9_]{5,32}$/.test(username) ? { contactHandle: username } : {}),
      });
    } catch (e) {
      if (!wasMember) village.db.query("DELETE FROM tg_routes WHERE member_id = ?").run(memberId);
      const detail = e instanceof AppError ? e.detail : "Something went wrong; please try again.";
      return ack(c, { text: detail.slice(0, 190), show_alert: true });
    }
    drafts.delete(c.from.id);
    await ack(c, { text: "Saved!" });
    await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const next = result.newProposal ? "A loop was found right away: see the message below." : result.openLoops > 0 ? "Your open loop stays as it is." : "I will message you as soon as I find a loop. Bring a friend: the more people join, the more loops close.";
    await c.reply(`${wasMember ? "Updated" : "You are in"} ✅\n${next}\n\n/status shows your favors and loops.`).catch(() => {});
  });
  const refusal = (e: unknown) => (e instanceof AppError ? e.detail.slice(0, 190) : "Something went wrong.");
  pm.callbackQuery(/^a:([0-9a-f-]{36}):([yn])$/, async c => {
    let r: ReturnType<typeof core.answer>;
    try {
      r = core.answer(village, memberOf(c.from.id), c.match[1], c.match[2] === "y" ? "yes" : "no");
    } catch (e) {
      await ack(c, { text: refusal(e), show_alert: true });
      await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }
    await ack(c, { text: c.match[2] === "y" ? "You said yes" : "You said no" });
    if (r.loop.status === "proposed") {
      const m = proposalMessage(r.loop);
      await c.editMessageText(m.text, { parse_mode: "HTML", reply_markup: m.keyboard }).catch(() => {});
    } else {
      // accepted: the accepted message arrives as its own message; dissolved: say so here
      await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      if (r.loop.status === "dissolved") await c.reply(esc(r.text)).catch(() => {});
    }
  });
  pm.callbackQuery(/^c:([0-9a-f-]{36})$/, async c => {
    let r: ReturnType<typeof core.confirm>;
    try {
      r = core.confirm(village, memberOf(c.from.id), c.match[1], true);
    } catch (e) {
      return ack(c, { text: refusal(e), show_alert: true });
    }
    await ack(c, { text: "Confirmed ✅" });
    await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    if (r.loop.status !== "completed") await c.reply(esc(r.text)).catch(() => {});
  });
  pm.callbackQuery("resume", async c => {
    const changed = core.resume(village, memberOf(c.from.id));
    await ack(c, { text: changed ? "You are back in the pool" : "Not paused" });
    await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  });
  pm.callbackQuery(/^leave:(yes|no)$/, async c => {
    // Delete before any Telegram call, so a refused callback answer can never skip the deletion.
    const r = c.match[1] === "yes" ? core.leave(village, memberOf(c.from.id)) : null;
    if (r) {
      drafts.delete(c.from.id);
      agreed.delete(c.from.id);
      reports.delete(c.from.id);
    }
    await ack(c);
    await c.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await c.reply(r ? `${r.text} Send /start if you ever want to come back.` : "Nothing changed.").catch(() => {});
  });

  // ---------------------------------------------------------------- free text: an agent's suggestion
  pm.on("message:text", async c => {
    if (c.message.text.startsWith("/")) return c.reply("I do not know that command. /help lists what I can do.");
    const parsed = parseAgentReply(c.message.text);
    const draft = drafts.get(c.from.id);
    if (!parsed) {
      if (draft?.awaitingAgent) return c.reply("I could not find the two lines starting with OFFERS: and WANTS:. Forward your agent's answer again, or tap /join and pick from the menu.");
      return c.reply("Hi! /start to begin, /status for your loops, /help for everything else.");
    }
    if (!agreed.has(c.from.id) && !core.isMember(village, memberOf(c.from.id))) return sendConsent(c);
    const origin = c.message.forward_origin;
    const next = draft ?? newDraft(c.from.id);
    next.offers = parsed.offers;
    next.wants = parsed.wants;
    next.giftOnly = false;
    next.awaitingAgent = false;
    next.suggestedBy = origin?.type === "user" && origin.sender_user.is_bot ? "agent" : "paste";
    next.step = "offers";
    next.touched = Date.now();
    await show(c, next, false);
  });

  bot.catch(err => log({ event: "bot_error", error: err.error instanceof Error ? err.error.name : "unknown" }));

  // Forget idle drafts after two hours.
  setInterval(() => {
    for (const [userId, draft] of drafts) if (Date.now() - draft.touched > 2 * 3600_000) drafts.delete(userId);
    for (const [userId, report] of reports) if (Date.now() - report.at > 2 * 3600_000) reports.delete(userId);
  }, 10 * 60_000);

  return { bot, onLoopEvent, drafts };
}

const COMMANDS = [
  { command: "start", description: "Start, or see where you are" },
  { command: "status", description: "Your favors and loops" },
  { command: "join", description: "Choose or change your favors" },
  { command: "help", description: "How it works and commands" },
  { command: "leave", description: "Delete everything Favor Loop holds about you" },
  { command: "report", description: "Tell an organiser about a problem" },
];

/**
 * Connects to Telegram and long-polls, in the background. Polling stops for good on some errors (401, or 409
 * when a second process polls the same token) and init can fail on a network blip, so a supervisor retries
 * with backoff up to a minute, forever. The web side and the MCP endpoint never wait for it.
 */
export function startBot(deps: BotDeps) {
  const { bot, onLoopEvent } = createBot(deps);
  const log = deps.log;
  let url: string | null = null;
  let stopped = false;
  let commandsSet = false;
  const supervise = async (attempt: number): Promise<void> => {
    try {
      await bot.init();
      url = `https://t.me/${bot.botInfo.username}`;
      if (!commandsSet) commandsSet = await bot.api.setMyCommands(COMMANDS).catch(() => false);
      await bot.start({
        allowed_updates: ["message", "callback_query"],
        onStart: info => {
          attempt = 0;
          log({ event: "bot", started: info.username });
        },
      });
    } catch (e) {
      const code = e instanceof GrammyError ? e.error_code : "network";
      log({ event: "bot", error: code, detail: code === 409 ? "another process polls this token" : "polling stopped; retrying" });
    }
    if (stopped) return;
    await Bun.sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    if (!stopped) return supervise(attempt + 1);
  };
  void supervise(0);
  return {
    url: () => url,
    onLoopEvent,
    stop: async () => {
      stopped = true;
      await bot.stop();
    },
  };
}
