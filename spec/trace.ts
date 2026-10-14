import { readFileSync } from "node:fs";

export const guides: Record<string, { mask: string[] }> = JSON.parse(readFileSync("public/guides/guides.json", "utf8"));
const GRID = 64;
const CELL = 1000 / GRID;

function inked(char: string): boolean[][] {
  return guides[char]!.mask.map((row) => {
    const bits = BigInt(`0x${row}`);
    return Array.from({ length: GRID }, (_, c) => ((bits >> BigInt(c)) & 1n) === 1n);
  });
}

// A trace that goes over every stroke of the guide: points sampled from its
// mask, walked depth-first, a new stroke wherever the walk jumps, with a
// little wobble.
export function trace(char: string): number[][][] {
  const mask = inked(char);
  const seen = mask.map((row) => row.map(() => false));
  let wobble = 1;
  const jitter = (): number => ((wobble = (wobble * 7919) % 9973) % 21) - 10;
  const pieces: number[][][] = [];
  let k = 0;
  const visit = (r: number, c: number, stroke: number[][]): void => {
    seen[r]![c] = true;
    if (k++ % 3 === 0) {
      const p = [Math.round((c + 0.5) * CELL) + jitter(), Math.round((r + 0.5) * CELL) + jitter()];
      const last = stroke.at(-1);
      if (last && Math.hypot(p[0]! - last[0]!, p[1]! - last[1]!) > 70) {
        pieces.push(stroke.splice(0));
      }
      stroke.push(p);
    }
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const rr = r + dr!;
      const cc = c + dc!;
      if (mask[rr]?.[cc] && !seen[rr]![cc]) visit(rr, cc, stroke);
    }
  };
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!mask[r]![c] || seen[r]![c]) continue;
      const stroke: number[][] = [];
      visit(r, c, stroke);
      if (stroke.length) pieces.push(stroke);
    }
  }
  return pieces.sort((a, b) => b.length - a.length).slice(0, 24);
}
