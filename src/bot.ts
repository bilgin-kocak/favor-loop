// Placeholder until the Telegram bot lands in the next commit.
import type { Ctx, LoopEvent } from "./core";
import type { Identity, Sealer } from "./identity";
import type { SimVillage } from "./sim";

export type BotDeps = { token: string; ctx: Ctx; identity: Identity; sealer: Sealer; sim: SimVillage; log: (line: Record<string, unknown>) => void };

export async function startBot(deps: BotDeps): Promise<{ url: string | null; onLoopEvent: (event: LoopEvent) => void }> {
  deps.log({ event: "bot", warning: "not built yet" });
  return { url: null, onLoopEvent: () => {} };
}
