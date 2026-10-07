import { readFileSync } from "node:fs";

// A visitor may carve their own seal by tracing one of a fixed set of
// small-seal characters (public/guides/, built from the CNS11643 Shuowen
// Jiezi font). Nothing on the scroll can be deleted, so a seal is accepted
// only if it really follows its guide, and everything about it is numbers,
// validated here and rendered to SVG here: no visitor string reaches markup.

interface Guide {
  meaning: string;
  path: string;
  mask: string[]; // GRID rows of GRID bits, lowest bit leftmost
}

export const GUIDES: Record<string, Guide> = JSON.parse(readFileSync("public/guides/guides.json", "utf8"));

export const STYLES = ["zhu", "bai"] as const; // 朱文 strokes on paper, 白文 strokes cut from a square
export type SealStyle = (typeof STYLES)[number];

export const SEAL_LIMITS = {
  grid: 1000, // points are integers from 0 to 1000 on both axes
  maxStrokes: 24,
  maxPointsPerStroke: 300,
  maxTotalPoints: 1500,
};

// The seal route's own body cap, from the limits above. The largest valid
// body is 1500 points of "[1000,1000]," (12 bytes each: 18,000), plus "[],"
// around each of 24 strokes (72), plus the keys, a character escaped as
// \uXXXX and a style (under 100): 18,172 bytes. A quarter again for
// whitespace a client might add, rounded up to the next KB: 24 KB.
export const MAX_SEAL_BODY_BYTES = 24 * 1024;

export interface CarvedSeal {
  char: string;
  style: SealStyle;
  strokes: number[][][];
}

export type SealVerdict = { ok: true; seal: CarvedSeal } | { ok: false; reason: "invalid" | "untraced" };

const GRID = 64;
const CELL = SEAL_LIMITS.grid / GRID;

function maskOf(char: string): boolean[][] {
  return GUIDES[char]!.mask.map((row) => {
    const bits = BigInt(`0x${row}`);
    return Array.from({ length: GRID }, (_, c) => ((bits >> BigInt(c)) & 1n) === 1n);
  });
}

const masks = new Map(Object.keys(GUIDES).map((ch) => [ch, maskOf(ch)]));

// Every cell within `radius` cells of an inked cell.
function dilate(mask: boolean[][], radius: number): boolean[][] {
  return mask.map((row, r) =>
    row.map((_, c) => {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr * dr + dc * dc > radius * radius) continue;
          if (mask[r + dr]?.[c + dc]) return true;
        }
      }
      return false;
    }),
  );
}

const NEAR = 2; // cells, about 31 of 1000 beyond a stroke's own edge
const nearMasks = new Map([...masks].map(([ch, m]) => [ch, dilate(m, NEAR)]));

// Tuned by simulation over all 31 guides: traces that go over every stroke
// with up to about ±40 units of wobble pass; scribbles, circles, traces of
// only a few strokes, and full traces of any other guide character all fail.
// Nearly every point has to fall near the guide, and together they have to
// cover most of it.
export const NEAR_SHARE = 0.93;
export const COVER_SHARE = 0.7;

// Points along every stroke, every few units, so a straight line drawn
// across empty paper counts as the empty paper it crosses.
function densify(strokes: number[][][]): [number, number][] {
  const out: [number, number][] = [];
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const [x, y] = stroke[i] as [number, number];
      if (i === 0) {
        out.push([x, y]);
        continue;
      }
      const [px, py] = stroke[i - 1] as [number, number];
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 8));
      for (let s = 1; s <= steps; s++) out.push([px + ((x - px) * s) / steps, py + ((y - py) * s) / steps]);
    }
  }
  return out;
}

const cellOf = (v: number): number => Math.min(GRID - 1, Math.floor(v / CELL));

export function followsGuide(char: string, strokes: number[][][]): boolean {
  const mask = masks.get(char);
  const near = nearMasks.get(char);
  if (!mask || !near) return false;
  const points = densify(strokes);
  if (points.length === 0) return false;

  const nearCount = points.filter(([x, y]) => near[cellOf(y)]![cellOf(x)]).length;
  if (nearCount / points.length < NEAR_SHARE) return false;

  const touched: boolean[][] = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  for (const [x, y] of points) touched[cellOf(y)]![cellOf(x)] = true;
  const reach = dilate(touched, NEAR);
  let inked = 0;
  let covered = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!mask[r]![c]) continue;
      inked++;
      if (reach[r]![c]) covered++;
    }
  }
  return covered / inked >= COVER_SHARE;
}

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= SEAL_LIMITS.grid);

// Validated at the boundary, whole or not at all: anything outside the shape
// is rejected, never trimmed, the same as an over-length line.
export function checkSeal(input: unknown): SealVerdict {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, reason: "invalid" };
  const keys = Object.keys(input).sort().join(",");
  if (keys !== "char,strokes,style") return { ok: false, reason: "invalid" };
  const { char, style, strokes } = input as Record<string, unknown>;
  if (typeof char !== "string" || !Object.hasOwn(GUIDES, char)) return { ok: false, reason: "invalid" };
  if (typeof style !== "string" || !(STYLES as readonly string[]).includes(style)) return { ok: false, reason: "invalid" };
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > SEAL_LIMITS.maxStrokes)
    return { ok: false, reason: "invalid" };
  let total = 0;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length < 1 || stroke.length > SEAL_LIMITS.maxPointsPerStroke)
      return { ok: false, reason: "invalid" };
    if (!stroke.every(isPoint)) return { ok: false, reason: "invalid" };
    total += stroke.length;
  }
  if (total > SEAL_LIMITS.maxTotalPoints) return { ok: false, reason: "invalid" };
  const seal = { char, style: style as SealStyle, strokes: strokes as number[][][] };
  return followsGuide(char, seal.strokes) ? { ok: true, seal } : { ok: false, reason: "untraced" };
}

// The same seed always gives the same worn edge, so a seal looks the same in
// the list, on the painting and in every visitor's browser.
function seedOf(strokes: number[][][]): number {
  let h = 7;
  for (const stroke of strokes) for (const [x, y] of stroke) h = (h * 31 + x! * 7 + y!) % 9973;
  return h;
}

// Built from the validated numbers alone. Colour is currentColor, so the
// stylesheet decides: vermilion where it's yours, ink everywhere else.
// `key` keeps the filter and mask ids unique on a page that shows the same
// seal more than once.
export function renderCarved(seal: CarvedSeal, key: string): string {
  const d = seal.strokes
    .map((s) => s.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("") + (s.length === 1 ? "l0 0.1" : ""))
    .join("");
  const wear = `wear-${key}`;
  const cut = `cut-${key}`;
  const filter = `<filter id="${wear}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seedOf(seal.strokes)}"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter>`;
  const strokeAttrs = `fill="none" stroke-width="78" stroke-linecap="round" stroke-linejoin="round"`;
  const body =
    seal.style === "zhu"
      ? `<rect x="-40" y="-40" width="1080" height="1080" rx="40" fill="none" stroke="currentColor" stroke-width="44"/><path d="${d}" stroke="currentColor" ${strokeAttrs}/>`
      : `<mask id="${cut}"><rect x="-70" y="-70" width="1140" height="1140" fill="#fff"/><path d="${d}" stroke="#000" ${strokeAttrs}/></mask><rect x="-62" y="-62" width="1124" height="1124" rx="36" fill="currentColor" mask="url(#${cut})"/>`;
  return `<svg class="carved" viewBox="-90 -90 1180 1180" aria-hidden="true" focusable="false"><defs>${filter}</defs><g filter="url(#${wear})">${body}</g></svg>`;
}
