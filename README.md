# Favor Loop

**No two of us could trade. The three of us could.**

Favor Loop is for residents of Edge City India (Mandrem, Goa). Everyone picks 1 to 3 favors they can give and 1 to 3 they would like, from a fixed menu of free 15-minute favors. Favor Loop finds the loops two people never could: A reviews C's code, C teaches B yoga, B takes A's portrait. It also finds swaps, and gift chains started by someone who only wants to give. A loop starts only when **everyone says yes** (a no is never shown), and every favor is **confirmed by the person who received it**. Completed loops light up on a live board.

Kismet finds who you should meet. Favor Loop finds who can help whom, and checks that the help actually happened.

One Bun + TypeScript service, one SQLite file, three surfaces calling the same core:

| Surface | Path | For |
|---|---|---|
| MCP server | `POST /mcp` | The Agent Village mini-app endpoint (residents' agents, once the team installs it) |
| Telegram bot | long polling | Real residents this week |
| Web | `/board`, `/how`, `/sim`, `/` | The projector board, privacy page, simulated village |

## Layout

```text
src/schemas.ts     the ONE schema file: manifest inputs and MCP tools/list both come from it
src/core.ts        join, myLoops, answer, confirm, leave, board; matcher runs; expiry
src/matcher.ts     pure matcher: three-loops, then gift chains, then swaps (greedy, vertex-disjoint)
src/mcp.ts         stateless MCP (2025-06-18): auth, identity refusal, results and errors, 32 KB cap
src/bot.ts         Telegram bot (grammY)
src/sim.ts         the simulated village: 150 synthetic members, separate in-memory database
src/web.ts         routes; public/*.html are the pages
agentvillage/      the files for the Edge-City/agentvillage pull request (generated, except SKILL.md)
scripts/           agentvillage.ts (generate), pr-checks.sh (local checks), village-shim.ts and demo-accounts.ts (demo)
demo/              a Claude Code project for the agent demo
video/             the 81-second video: Remotion scenes, ElevenLabs voice and sound effects (video/README.md)
```

## Run locally

```bash
bun install
```

```bash
cp .env.example .env
```

```bash
bun run dev
```

```bash
bun test
```

```bash
bun run typecheck
```

Open http://localhost:8080/board?view=sim to see the simulated village. Leave `TELEGRAM_BOT_TOKEN` empty locally if the deployed bot is running: Telegram allows one poller per token.

## Environment

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `PUBLIC_BASE_URL` | Public HTTPS origin, e.g. `https://favorloop.fly.dev` |
| `MINI_APP_FAVORLOOP_KEY` | The app token Agent Village sends as `Bearer`; give it to the organisers privately |
| `ADMIN_TG_IDS` | Comma-separated Telegram ids for `/stats` and `/report` |
| `DB_PATH` | SQLite file (`/data/favorloop.db` on Fly) |
| `HASH_SALT` | Secret salt for member keys. **Set once, never change**: changing it orphans every member |
| `DELETE_ALL_AT` | `2026-11-30T00:00:00+05:30`: everything is deleted then, and joins stop |
| `FAVORLOOP_DEMO_KEY` | Optional. Private calls with this key reach an isolated in-memory village of test accounts, so a demo never touches real data |

## Deploy to Fly.io

`fly.toml` runs one machine in Singapore (`sin`, the closest Fly region to Goa) with a volume for SQLite, and never auto-stops (the bot polls). If the name `favorloop` is taken, change `app` and `PUBLIC_BASE_URL` in `fly.toml`.

```bash
fly launch --copy-config --no-deploy
```

```bash
fly volumes create favorloop_data --region sin --size 1
```

Generate the three secrets and keep them in your password manager (`openssl rand -hex 32` each), then:

```bash
fly secrets set TELEGRAM_BOT_TOKEN=... MINI_APP_FAVORLOOP_KEY=... HASH_SALT=... FAVORLOOP_DEMO_KEY=... ADMIN_TG_IDS=...
```

```bash
fly deploy
```

```bash
curl -s https://favorloop.fly.dev/healthz
```

Render or a small VPS work too: build the `Dockerfile`, mount a persistent disk at `/data`, run exactly one instance.

## The Agent Village pull request (open it by Friday 12:00 IST)

1. Regenerate the files for your real host (the manifest, the README contract and the fixtures carry it):

   ```bash
   bun run agentvillage -- --host https://favorloop.fly.dev
   ```

2. Fork `Edge-City/agentvillage`, clone it with full history next to this repo, and make a branch. Then copy the files in and run the buildathon's local checks (they need Bun 1.4 or later; `bun upgrade`):

   ```bash
   scripts/pr-checks.sh ../agentvillage https://favorloop.fly.dev/mcp
   ```

   Expect: the skill pin matches, the validator says `{"ok":true}`, conformance prints `passed: true`, and the manifest test is red only on `favorloop/: not in catalog.json`. The live `--service` check reports `service.reachability` FAIL by design: public reads answer without a token, as Kismet's do. That row is advisory.

3. Commit only `mini-apps/favorloop/`, `skills/favorloop/` and `scripts/tests/fixtures/favorloop/`, then run the review bot. Expect `NEEDS_HUMAN` in lane `core` with only `core_path` findings (the fixtures), never `FAIL`:

   ```bash
   bun scripts/mini-apps-review.ts --base origin/main --head HEAD --author bilgin-kocak
   ```

4. Open the pull request from your account (`bilgin-kocak`, which must match `owner.github`) with the text in `docs/PR_DESCRIPTION.md`, then send `MINI_APP_FAVORLOOP_KEY` to the organisers privately. Never put a key in the pull request, an issue or a chat.

Whenever `SKILL.md` changes, its sha256 changes: rerun step 1.

## The agent demo

The `village` shim (`scripts/village-shim.ts`) is a local MCP server with one tool, `village`, that behaves like a resident's native Agent Village tool: it accepts only the manifest's operations, checks arguments against the manifest, refuses identity keys, and calls the endpoint the way the app server does. With `FAVORLOOP_DEMO_KEY` set on the server, use that key here so every test account lives in the isolated test village and is never counted as a real resident.

```bash
export FAVORLOOP_MCP_URL=https://favorloop.fly.dev/mcp FAVORLOOP_TEST_KEY=<your FAVORLOOP_DEMO_KEY>
```

```bash
bun run demo seed
```

```bash
cd demo && claude
```

Then, labelled "test accounts" on screen:

1. "Join Favor Loop: I can review code, I'd like a portrait." The agent shows exactly what it will send; say "Yes, send it." The loop with the two test accounts is proposed at once.
2. "Show my loops", then "Yes to that loop."
3. In another terminal, `bun run demo yes`: the other two say yes, and the loop is accepted.
4. `bun run demo confirm`, then tell the agent "I got my portrait." The agent confirms it and the loop completes.
5. Show `https://favorloop.fly.dev/board?view=demo` (labelled TEST ACCOUNTS), then the real board and `/board?view=sim` (labelled SIMULATED).

`bun run demo leave` clears the test accounts.

## Privacy and safety

- Favor Loop stores only the favors you pick, your availability and, if you choose, your Telegram handle. The Telegram bot also keeps your chat id, encrypted, so it can message you.
- Members are keyed by an HMAC of their Agent Village subject or Telegram id; neither is stored in the clear, and logs never carry arguments, subjects or handles.
- A handle is shown only to the people you give to or receive from, only after everyone said yes. A no is never shown. The board is anonymous.
- `/leave` (or `favorloop.leave`) deletes everything at once. All data is deleted on 30 Nov 2026.
- Favors are free, about 15 minutes, in a public place or online. Anyone can say no or leave at any time. `/report` reaches an organiser.
- Simulated members and test accounts live in their own databases, are always labelled, and are never counted as real.

What to claim: built as an Agent Village mini-app (pull request [#556](https://github.com/Edge-City/agentvillage/pull/556)); residents used it this week through the Favor Loop Telegram bot. Never say it is installed in the village until the Agent Village team says so.
