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
  seal_id: number | null;
  // the carved seal the line was written with, if any (joined from seals)
  seal_char: string | null;
  seal_style: string | null;
  seal_strokes: string | null;
}

export interface SealRow {
  id: number;
  token: string;
  char: string;
  style: string;
  strokes: string; // JSON, validated by src/carve.ts before it ever got here
  created_at: number;
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

// Carved seals, additive like everything else: a visitor's seal is one row,
// redone in place until the first line that carries it is written, and fixed
// from then on. Each colophon keeps the seal it was written with.
db.exec(`
  CREATE TABLE IF NOT EXISTS seals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    char TEXT NOT NULL,
    style TEXT NOT NULL,
    strokes TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
if (!hasColumn("colophons", "seal_id")) db.exec("ALTER TABLE colophons ADD COLUMN seal_id INTEGER REFERENCES seals(id)");

const WITH_SEAL = `SELECT c.*, s.char AS seal_char, s.style AS seal_style, s.strokes AS seal_strokes
  FROM colophons c LEFT JOIN seals s ON s.id = c.seal_id`;
const selectAll = db.prepare(`${WITH_SEAL} ORDER BY c.id ASC`);
const selectAfter = db.prepare(`${WITH_SEAL} WHERE c.id > ? ORDER BY c.id ASC`);
const selectOne = db.prepare(`${WITH_SEAL} WHERE c.id = ?`);
const selectSeal = db.prepare("SELECT * FROM seals WHERE token = ? ORDER BY id DESC LIMIT 1");
const selectSealUsed = db.prepare("SELECT 1 FROM colophons WHERE seal_id = ? LIMIT 1");
const insertSeal = db.prepare("INSERT INTO seals (token, char, style, strokes, created_at) VALUES (?, ?, ?, ?, ?)");
const updateSeal = db.prepare("UPDATE seals SET char = ?, style = ?, strokes = ?, created_at = ? WHERE id = ?");
const deleteSeal = db.prepare("DELETE FROM seals WHERE id = ?");
const selectTaken = db.prepare("SELECT spot_x AS x, spot_y AS y FROM colophons WHERE spot_x IS NOT NULL");
const selectLastBy = db.prepare("SELECT MAX(created_at) AS at FROM colophons WHERE token = ?");
const insert = db.prepare(
  "INSERT INTO colophons (token, body, created_at, spot_x, spot_y, seal_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
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
    const seal = currentSeal(token);
    const { id } = insert.get(token, body, Date.now(), spot?.x ?? null, spot?.y ?? null, seal?.id ?? null) as {
      id: number;
    };
    const row = selectOne.get(id) as unknown as Colophon;
    db.exec("COMMIT");
    return row;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function currentSeal(token: string): SealRow | undefined {
  return selectSeal.get(token) as unknown as SealRow | undefined;
}

export function sealFixed(seal: SealRow): boolean {
  return selectSealUsed.get(seal.id) !== undefined;
}

// Saves a visitor's carved seal, or refuses once a line carries it.
export function saveSeal(token: string, char: string, style: string, strokes: string): SealRow | "fixed" {
  db.exec("BEGIN IMMEDIATE");
  try {
    const cur = currentSeal(token);
    if (cur && sealFixed(cur)) {
      db.exec("ROLLBACK");
      return "fixed";
    }
    if (cur) updateSeal.run(char, style, strokes, Date.now(), cur.id);
    else insertSeal.run(token, char, style, strokes, Date.now());
    const saved = currentSeal(token)!;
    db.exec("COMMIT");
    return saved;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Back to a generated seal: only a seal no line carries yet can go, since it
// was never on the scroll.
export function clearSeal(token: string): "cleared" | "fixed" {
  const cur = currentSeal(token);
  if (!cur) return "cleared";
  if (sealFixed(cur)) return "fixed";
  deleteSeal.run(cur.id);
  return "cleared";
}
