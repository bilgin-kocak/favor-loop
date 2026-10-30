// Environment, read once at startup.
const env = (name: string, fallback = "") => (process.env[name] ?? fallback).trim();

export const config = {
  port: Number(env("PORT", "8080")),
  /** The public HTTPS origin, no trailing slash: https://favorloop.fly.dev */
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:8080").replace(/\/+$/, ""),
  /** The app token Agent Village sends as a Bearer; never in the repo. */
  appKey: env("MINI_APP_FAVORLOOP_KEY"),
  /** Optional, for demos: private calls with this key reach an isolated in-memory village of test accounts. */
  demoKey: env("FAVORLOOP_DEMO_KEY"),
  telegramToken: env("TELEGRAM_BOT_TOKEN"),
  adminTgIds: new Set(env("ADMIN_TG_IDS").split(",").map(s => s.trim()).filter(Boolean)),
  dbPath: env("DB_PATH", "./data/favorloop.db"),
  hashSalt: env("HASH_SALT"),
  deleteAllAt: Date.parse(env("DELETE_ALL_AT", "2026-11-30T00:00:00+05:30")),
};

/** Why the server must not start with this salt, or null. Member keys and board ids are HMACs under it, so a
 * missing or guessable one would make them computable. */
export function saltProblem(salt: string): string | null {
  if (!salt) return "HASH_SALT is not set";
  if (salt === "favorloop-insecure-development-salt") return "HASH_SALT is the old public development default";
  if (salt.length < 32) return "HASH_SALT must be at least 32 characters (openssl rand -hex 32)";
  return null;
}

export function configProblems(): string[] {
  const problems: string[] = [];
  if (!config.appKey) problems.push("MINI_APP_FAVORLOOP_KEY is not set: every private MCP tool answers not_authorized");
  if (!config.telegramToken) problems.push("TELEGRAM_BOT_TOKEN is not set: the Telegram bot is off");
  if (!config.publicBaseUrl.startsWith("https://")) problems.push("PUBLIC_BASE_URL is not https: fine locally, wrong in production");
  if (Number.isNaN(config.deleteAllAt)) problems.push("DELETE_ALL_AT is not a date");
  if (config.demoKey && config.demoKey === config.appKey) problems.push("FAVORLOOP_DEMO_KEY equals the app key: demo calls would reach the test village only");
  return problems;
}
