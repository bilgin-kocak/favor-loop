import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// seats.member_id and edges.giver/receiver are not foreign keys: when a member leaves, their past loops
// keep an anonymous placeholder so the board's counts stay true without pointing at anyone.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('av', 'tg', 'sim')),
  offers TEXT NOT NULL,
  wants TEXT NOT NULL,
  gift_only INTEGER NOT NULL DEFAULT 0,
  handle TEXT,
  availability TEXT NOT NULL DEFAULT '[]',
  paused INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS loops (
  id TEXT PRIMARY KEY,
  shape TEXT NOT NULL CHECK (shape IN ('loop3', 'chain', 'swap')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'dissolved', 'expired', 'completed')),
  time_window TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS loops_status ON loops (status);
CREATE TABLE IF NOT EXISTS seats (
  loop_id TEXT NOT NULL REFERENCES loops (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  answer TEXT CHECK (answer IN ('yes', 'no')),
  PRIMARY KEY (loop_id, member_id)
);
CREATE INDEX IF NOT EXISTS seats_member ON seats (member_id);
CREATE TABLE IF NOT EXISTS edges (
  loop_id TEXT NOT NULL REFERENCES loops (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  giver TEXT NOT NULL,
  receiver TEXT NOT NULL,
  favor TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at INTEGER,
  PRIMARY KEY (loop_id, position)
);
CREATE TABLE IF NOT EXISTS blocked_groups (
  group_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tg_routes (
  member_id TEXT PRIMARY KEY,
  sealed TEXT NOT NULL
);
`;

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

/** Deletes every row (the 30 Nov 2026 purge). */
export function purgeAll(db: Database) {
  db.transaction(() => {
    for (const table of ["edges", "seats", "loops", "blocked_groups", "tg_routes", "members"]) db.exec(`DELETE FROM ${table}`);
  })();
}
