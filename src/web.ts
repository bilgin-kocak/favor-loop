// HTTP routes: the MCP endpoint, the public pages and the board's JSON. No redirects anywhere.
import type { Server } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAT_ID_NOTE, howItWorks, PRIVACY_PROMISES, SAFETY } from "./content";
import { handleMcp, type McpDeps } from "./mcp";
import { FAVORS } from "./menu";

export type WebDeps = {
  mcp: McpDeps;
  publicDir: string;
  realGraph(): unknown;
  simGraph(): unknown;
  /** Test accounts' village, when FAVORLOOP_DEMO_KEY is set. */
  demoGraph: (() => unknown) | null;
  restartSim(): boolean;
  botUrl(): string | null;
};

const PAGES = ["index", "board", "how", "sim"] as const;
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const items = (lines: readonly string[]) => lines.map(line => `<li>${escapeHtml(line)}</li>`).join("");

/** Page text that must say exactly what the bot and the MCP tools say comes from src/content.ts. */
const SHARED_BLOCKS: Record<string, string> = {
  "{{STEPS_LIST}}": items(howItWorks("").steps),
  "{{PRIVACY_LIST}}": items(PRIVACY_PROMISES),
  "{{CHAT_ID_NOTE}}": escapeHtml(CHAT_ID_NOTE),
  "{{SAFETY_LIST}}": items(SAFETY),
  "{{MENU_LIST}}": FAVORS.map(f => `<li><span>${f.emoji}</span> ${escapeHtml(f.label)} <code>${f.id}</code></li>`).join(""),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...SECURITY_HEADERS } });
const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...SECURITY_HEADERS } });

/** Behind Fly (or any proxy) the client address is in a header; locally it is the socket's. */
export function clientIp(req: Request, server?: Server<unknown>): string {
  return req.headers.get("fly-client-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? server?.requestIP(req)?.address
    ?? "unknown";
}

export function makeFetch(deps: WebDeps) {
  const templates = Object.fromEntries(PAGES.map(name => [name, readFileSync(join(deps.publicDir, `${name}.html`), "utf8")]));
  const page = (name: (typeof PAGES)[number]) => {
    const bot = deps.botUrl();
    let html = templates[name];
    for (const [marker, block] of Object.entries(SHARED_BLOCKS)) html = html.replaceAll(marker, block);
    html = html
      .replaceAll("{{BASE}}", deps.mcp.publicBaseUrl)
      .replaceAll("{{BOT_URL}}", bot ?? "#")
      .replaceAll("{{BOT_LABEL}}", bot ? bot.replace("https://", "") : "the Favor Loop Telegram bot (starting soon)");
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SECURITY_HEADERS } });
  };

  return async function fetch(req: Request, server?: Server<unknown>): Promise<Response> {
    const url = new URL(req.url);
    const get = req.method === "GET" || req.method === "HEAD";
    switch (url.pathname) {
      case "/mcp":
        return handleMcp(req, clientIp(req, server), deps.mcp);
      case "/":
        return get ? page("index") : text("Method not allowed", 405);
      case "/board":
      case "/how":
      case "/sim":
        return get ? page(url.pathname.slice(1) as "board" | "how" | "sim") : text("Method not allowed", 405);
      case "/api/board": {
        if (!get) return text("Method not allowed", 405);
        const view = url.searchParams.get("view");
        if (view === "sim") return json(deps.simGraph());
        if (view === "demo") return deps.demoGraph ? json({ ...(deps.demoGraph() as object), demo: true }) : text("Not found", 404);
        return json(deps.realGraph());
      }
      case "/api/sim/restart":
        if (req.method !== "POST") return text("Method not allowed", 405);
        return deps.restartSim() ? json({ restarted: true }) : json({ restarted: false, detail: "The simulation restarted moments ago." }, 429);
      case "/healthz":
        return text("ok", 200);
      default:
        // A near miss on the endpoint (/mcp/, /mcp/sse) or a client's discovery lookup leaves an MCP-style line (never
        // the path), so a misconfigured caller shows in the logs.
        if (url.pathname.startsWith("/mcp") || url.pathname.startsWith("/.well-known/")) {
          deps.mcp.log?.({ method: "-", result: url.pathname.startsWith("/mcp") ? "wrong_path" : "well_known", ms: 0 });
        }
        return text("Not found", 404);
    }
  };
}
