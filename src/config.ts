// Environment, read once at startup.
const env = (name: string, fallback = "") => (process.env[name] ?? fallback).trim();

export const config = {
  port: Number(env("PORT", "8080")),
  /** The public HTTPS origin, no trailing slash: https://favorloop.fly.dev */
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:8080").replace(/\/+$/, ""),
  /** The app token Agent Village sends as a Bearer; never in the repo. */
  appKey: env("MINI_APP_FAVORLOOP_KEY"),
  telegramToken: env("TELEGRAM_BOT_TOKEN"),
  adminTgIds: new Set(env("ADMIN_TG_IDS").split(",").map(s => s.trim()).filter(Boolean)),
  dbPath: env("DB_PATH", "./data/favorloop.db"),
  hashSalt: env("HASH_SALT"),
  deleteAllAt: Date.parse(env("DELETE_ALL_AT", "2026-11-30T00:00:00+05:30")),
};

export function configProblems(): string[] {
  const problems: string[] = [];
  if (!config.hashSalt) problems.push("HASH_SALT is not set: member ids are hashed with an insecure development salt");
  if (!config.appKey) problems.push("MINI_APP_FAVORLOOP_KEY is not set: every private MCP tool answers not_authorized");
  if (!config.telegramToken) problems.push("TELEGRAM_BOT_TOKEN is not set: the Telegram bot is off");
  if (!config.publicBaseUrl.startsWith("https://")) problems.push("PUBLIC_BASE_URL is not https: fine locally, wrong in production");
  if (Number.isNaN(config.deleteAllAt)) problems.push("DELETE_ALL_AT is not a date");
  return problems;
}
