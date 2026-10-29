// Words shared by the MCP tools, the Telegram bot and the web pages.
import { FAVORS, SLOTS } from "./menu";

export const PITCH = "No two of us could trade. The three of us could.";

export const PRIVACY_PROMISES = [
  "Favor Loop stores only the favors you pick, your availability and, if you choose, your Telegram handle.",
  "Your handle is shown only to people in a loop you said yes to.",
  "The board is anonymous.",
  "You can leave at any time, which deletes everything. All data is deleted on 30 Nov 2026.",
];

// The bot cannot message anyone without their chat id, so its consent says so in the first line.
export const CHAT_ID_NOTE = "The Telegram bot also keeps your chat id, encrypted, so it can message you about your loops; /leave deletes it.";
export const TELEGRAM_CONSENT = [
  "Favor Loop stores only the favors you pick, your availability and, if you choose, your Telegram handle (plus your chat id, encrypted, so this bot can message you).",
  "Your handle is shown only to people in a loop you said yes to.",
  "The board is anonymous.",
  "Use /leave to delete everything at any time. All data is deleted on 30 Nov 2026.",
];

export const SAFETY = [
  "Favors are free and take about 15 minutes. Never arrange payment.",
  "Meet in a public place such as The Circle, or online.",
  "Anyone can say no or leave at any time.",
];

export function howItWorks(base: string) {
  return {
    text: "Favor Loop finds loops of 15-minute favors between residents, such as A helps B, B helps C and C helps A, when no two of them could swap directly; a loop starts only when everyone says yes.",
    steps: [
      "Pick 1 to 3 favors you can give and 1 to 3 you would like, from a fixed menu of 15-minute favors, or say you only want to give.",
      "Favor Loop looks for two-way swaps, three-way loops and gift chains started by someone who only wants to give.",
      "Everyone in a proposed loop says yes or no within 6 hours. A no is never shown to the others.",
      "When everyone says yes, each person sees the Telegram handle (if shared) of the people they give to and receive from.",
      "After each favor, the person who received it confirms it. When every favor is confirmed, the loop is complete and lights up on the board.",
    ],
    shapes: [
      { shape: "swap", example: "A helps B and B helps A." },
      { shape: "loop3", example: "A helps B, B helps C and C helps A." },
      { shape: "chain", example: "Someone who only wants to give helps A, and A helps B." },
    ],
    rules: SAFETY,
    privacy: PRIVACY_PROMISES,
    board: `${base}/board`,
  };
}

export function menuPayload() {
  return {
    text: "Favor Loop's menu has 12 free favors of about 15 minutes each, in a public place or online; use these ids to join.",
    favors: FAVORS.map(f => ({ id: f.id, label: f.label })),
    availability: SLOTS.map(s => ({ id: s.id, label: s.label })),
    minutesEach: 15,
  };
}

/** The prompt a resident sends to their own Agent Village agent to get suggested ids. */
export const AGENT_PROMPT = `From the Favor Loop menu below, which 1 to 3 favors could I give someone in 15 minutes, and which 1 to 3 would I most like to receive? Base it on what you know about me; if you are guessing, pick fewer. Use only these ids: code_review, portrait_photo, stretch_session, pitch_feedback, cv_review, design_feedback, ai_tool_setup, wallet_setup, language_basics, music_lesson, proofreading, goa_tips. Answer in exactly two lines:
OFFERS: id, id
WANTS: id, id`;
