// Where a colophon's seal goes on the painting. Measured by eye against
// public/scroll-{0,1,2}.avif, which tile one 7430×600 image left to right;
// every number below is in that image's pixels and stored as a fraction of
// it, so a seal stays put at any display size or zoom.
export const IMAGE_WIDTH = 7430;
export const IMAGE_HEIGHT = 600;

// Never placed on. A seal's centre keeps at least SEAL_CLEARANCE pixels away
// from each of these (a seal is drawn about 42px across at full size).
export const OFF_LIMITS: { what: string; x0: number; x1: number; y0: number; y1: number }[] = [
  { what: "Wang Yi's inscription and the seals down the painting's left edge", x0: 5264, x1: 5404, y0: 0, y1: 600 },
  { what: "Ni Zan's pine, trunk and every branch", x0: 5404, x1: 5854, y0: 0, y1: 545 },
  { what: "the large rock at the foot of the pine", x0: 5764, x1: 5994, y0: 305, y1: 555 },
  { what: "the figure of Yang Zhuxi, his staff included", x0: 6034, x1: 6334, y0: 65, y1: 495 },
  { what: "the small rock below the figure", x0: 6034, x1: 6184, y0: 515, y1: 595 },
  { what: "the low rock to the figure's right", x0: 6530, x1: 6730, y0: 400, y1: 475 },
  { what: "the column of collectors' seals down the painting's right edge", x0: 6660, x1: 6775, y0: 0, y1: 600 },
  { what: "the title slip, its inscriptions and seals", x0: 6985, x1: 7430, y0: 0, y1: 600 },
  { what: "every colophon sheet left of the painting", x0: 0, x1: 5084, y0: 0, y1: 600 },
];

export const SEAL_CLEARANCE = 25;

// Blank silk inside the painting (above the rock, either side of the figure)
// and the plain mounting silk either side of it, interleaved so the first
// few seals scatter instead of filling one patch.
const B = [[6370, 60], [6460, 130], [6560, 60], [6620, 150], [6380, 220], [6500, 250], [6600, 300], [6430, 350]];
const A = [[5895, 60], [5975, 130], [6060, 60], [5900, 200], [6000, 230], [6080, 150]];
const D = [[6830, 80], [6930, 170], [6830, 280], [6930, 380], [6830, 490]];
const C = [[5130, 90], [5210, 200], [5130, 310], [5210, 420], [5130, 530]];

function interleave(...lists: number[][][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; out.length < lists.reduce((n, l) => n + l.length, 0); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]!);
  }
  return out;
}

export interface Spot {
  x: number;
  y: number;
}

const round = (n: number): number => Math.round(n * 10000) / 10000;

export const SPOTS: Spot[] = interleave(B, A, D, C).map(([x, y]) => ({
  x: round(x! / IMAGE_WIDTH),
  y: round(y! / IMAGE_HEIGHT),
}));

// The first spot nobody holds yet, or none: once the list is used up a seal
// lives in the list of colophons only and the painting is never covered.
export function firstFreeSpot(taken: Spot[], spots: Spot[] = SPOTS): Spot | undefined {
  return spots.find((s) => !taken.some((t) => t.x === s.x && t.y === s.y));
}
