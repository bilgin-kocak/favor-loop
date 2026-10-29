// The fixed favor menu and availability slots. Ids never change: the manifest, the matcher and the
// Telegram buttons all key on them, and menu order breaks ties when two favors could fill one edge.

export const FAVORS = [
  { id: "code_review", label: "Code review", short: "Code review", emoji: "💻" },
  { id: "portrait_photo", label: "Portrait photo", short: "Portrait photo", emoji: "📸" },
  { id: "stretch_session", label: "Yoga or stretching session", short: "Yoga / stretching", emoji: "🧘" },
  { id: "pitch_feedback", label: "Pitch or deck feedback", short: "Pitch feedback", emoji: "🎤" },
  { id: "cv_review", label: "CV or LinkedIn review", short: "CV / LinkedIn", emoji: "📄" },
  { id: "design_feedback", label: "Design feedback (UI, logo, poster)", short: "Design feedback", emoji: "🎨" },
  { id: "ai_tool_setup", label: "Help setting up an AI tool", short: "AI tool setup", emoji: "🤖" },
  { id: "wallet_setup", label: "Crypto wallet setup help", short: "Wallet setup", emoji: "👛" },
  { id: "language_basics", label: "Language basics (Hindi, Konkani or another)", short: "Language basics", emoji: "🗣️" },
  { id: "music_lesson", label: "Short music lesson", short: "Music lesson", emoji: "🎵" },
  { id: "proofreading", label: "Proofread a short text", short: "Proofreading", emoji: "✍️" },
  { id: "goa_tips", label: "Goa local tips (food, places, getting around)", short: "Goa tips", emoji: "🌴" },
] as const;

export type FavorId = (typeof FAVORS)[number]["id"];
export const FAVOR_IDS: readonly string[] = FAVORS.map(f => f.id);

// Slot end times are in IST; a slot that has ended is never suggested.
export const SLOTS = [
  { id: "thu_evening", label: "Thursday evening", endsAt: Date.parse("2026-10-29T23:00:00+05:30") },
  { id: "fri_morning", label: "Friday morning", endsAt: Date.parse("2026-10-30T12:00:00+05:30") },
  { id: "fri_afternoon", label: "Friday afternoon", endsAt: Date.parse("2026-10-30T18:00:00+05:30") },
  { id: "sat", label: "Saturday", endsAt: Date.parse("2026-10-31T23:59:00+05:30") },
] as const;

export const SLOT_IDS: readonly string[] = SLOTS.map(s => s.id);

export const favorLabel = (id: string) => FAVORS.find(f => f.id === id)?.label ?? id;
export const favorShort = (id: string) => FAVORS.find(f => f.id === id)?.short ?? id;
export const favorEmoji = (id: string) => FAVORS.find(f => f.id === id)?.emoji ?? "•";
export const slotLabel = (id: string) => SLOTS.find(s => s.id === id)?.label ?? id;

/** "Code review, Portrait photo and Goa tips" */
export function listLabels(ids: readonly string[], label = favorLabel): string {
  const words = ids.map(label);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
