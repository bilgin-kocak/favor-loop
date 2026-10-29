import { FAVOR_IDS } from "./menu";

/**
 * Reads an agent's two-line answer ("OFFERS: id, id" / "WANTS: id, id"), tolerating Markdown, backticks and
 * stray words. Only menu ids survive, at most 3 each, never the same id in both. Null if nothing usable.
 */
export function parseAgentReply(text: string): { offers: string[]; wants: string[] } | null {
  const lines = text.split(/\r?\n/);
  const idsAfter = (label: string) => {
    const line = lines.find(l => new RegExp(`^[\\s*_>\`-]*${label}[*_\`]*\\s*:`, "i").test(l));
    if (!line) return [];
    const ids = line.slice(line.indexOf(":") + 1).toLowerCase().split(/[^a-z_]+/).filter(id => FAVOR_IDS.includes(id));
    return [...new Set(ids)];
  };
  const offers = idsAfter("OFFERS?").slice(0, 3);
  const wants = idsAfter("WANTS?").filter(id => !offers.includes(id)).slice(0, 3);
  return offers.length || wants.length ? { offers, wants } : null;
}
