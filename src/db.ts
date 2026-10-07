import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { firstFreeSpot, type Spot } from "./spots.ts";

// /data is the one thing that survives a restart or redeploy (fly.toml mounts
// a volume there). Locally and in CI (which mounts a throwaway /data of its
// own, per checks.yml) it exists too; only a bare local checkout falls back
// to a repo-relative path.
const DB_PATH = process.env.DB_PATH ?? (existsSync("/data") ? "/data/colophon.db" : "./data/colophon.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS colophons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

export interface Colophon {
  id: number;
  token: string;
  body: string;
  created_at: number;
  spot_x: number | null;
  spot_y: number | null;
}

function hasColumn(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
}

// Additive, like the table itself: a seal's spot on the painting, as fractions
// of the image. Colophons written before the column existed get spots in id
// order, once, the moment it's added.
if (!hasColumn("colophons", "spot_x")) {
  db.exec("BEGIN IMMEDIATE");
  db.exec("ALTER TABLE colophons ADD COLUMN spot_x REAL");
  db.exec("ALTER TABLE colophons ADD COLUMN spot_y REAL");
  const place = db.prepare("UPDATE colophons SET spot_x = ?, spot_y = ? WHERE id = ?");
  const taken: Spot[] = [];
  for (const { id } of db.prepare("SELECT id FROM colophons ORDER BY id").all() as { id: number }[]) {
    const spot = firstFreeSpot(taken);
    if (!spot) break;
    taken.push(spot);
    place.run(spot.x, spot.y, id);
  }
  db.exec("COMMIT");
}

const selectAll = db.prepare("SELECT * FROM colophons ORDER BY id ASC");
const selectAfter = db.prepare("SELECT * FROM colophons WHERE id > ? ORDER BY id ASC");
const selectTaken = db.prepare("SELECT spot_x AS x, spot_y AS y FROM colophons WHERE spot_x IS NOT NULL");
const selectLastBy = db.prepare("SELECT MAX(created_at) AS at FROM colophons WHERE token = ?");
const insert = db.prepare(
  "INSERT INTO colophons (token, body, created_at, spot_x, spot_y) VALUES (?, ?, ?, ?, ?) RETURNING *",
);

export function listColophons(): Colophon[] {
  return selectAll.all() as unknown as Colophon[];
}

export function colophonsAfter(id: number): Colophon[] {
  return selectAfter.all(id) as unknown as Colophon[];
}

// Milliseconds until this seal may write again (0 if it may now), read from
// the colophons table itself so a restart can't reset anyone's wait.
export function waitFor(token: string, intervalMs: number, now = Date.now()): number {
  const { at } = selectLastBy.get(token) as { at: number | null };
  return at === null ? 0 : Math.max(0, at + intervalMs - now);
}

// The spot is chosen inside the same write that saves the line: node:sqlite
// is one synchronous writer in one process, so two lines arriving at the same
// moment can never be handed the same spot.
export function addColophon(token: string, body: string): Colophon {
  db.exec("BEGIN IMMEDIATE");
  try {
    const spot = firstFreeSpot(selectTaken.all() as unknown as Spot[]);
    const row = insert.get(token, body, Date.now(), spot?.x ?? null, spot?.y ?? null) as unknown as Colophon;
    db.exec("COMMIT");
    return row;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
