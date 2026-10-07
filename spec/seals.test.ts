import { expect, inject, it } from "vitest";
import { firstFreeSpot, IMAGE_HEIGHT, IMAGE_WIDTH, OFF_LIMITS, SEAL_CLEARANCE, SPOTS } from "../src/spots.ts";
import { marker, write } from "./sse.ts";

// Every colophon stamps its seal onto the painting, on blank silk, at a spot
// the server hands out inside the same write that saves the line. Spots never
// repeat, never cover the figure, pine, rocks or title slip, and once they run
// out a seal lives in the list only.
const baseUrl = inject("baseUrl");

const px = (s: { x: number; y: number }) => ({ x: s.x * IMAGE_WIDTH, y: s.y * IMAGE_HEIGHT });

it("every spot keeps clear of the figure, pine, rocks, title slip and seal columns", () => {
  for (const spot of SPOTS.map(px)) {
    for (const r of OFF_LIMITS) {
      const dx = Math.max(r.x0 - spot.x, 0, spot.x - r.x1);
      const dy = Math.max(r.y0 - spot.y, 0, spot.y - r.y1);
      expect(Math.hypot(dx, dy), `spot ${spot.x},${spot.y} is too close to ${r.what}`).toBeGreaterThanOrEqual(
        SEAL_CLEARANCE,
      );
    }
  }
});

it("no two spots overlap", () => {
  const all = SPOTS.map(px);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y)).toBeGreaterThan(60);
    }
  }
});

it("hands out the first free spot, and none once a small list runs out", () => {
  const small = [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
  ];
  expect(firstFreeSpot([], small)).toEqual(small[0]);
  expect(firstFreeSpot([small[0]!], small)).toEqual(small[1]);
  expect(firstFreeSpot([small[1]!], small)).toEqual(small[0]);
  expect(firstFreeSpot(small, small)).toBeUndefined();
});

async function paintingSeals(): Promise<{ id: string; left: string; top: string }[]> {
  const text = await (await fetch(new URL("/", baseUrl))).text();
  return [...text.matchAll(/class="painting-seal[^"]*" href="#c-(\d+)"[^>]*?style="left: ([\d.]+)%; top: ([\d.]+)%"/g)].map(
    (m) => ({ id: m[1]!, left: m[2]!, top: m[3]! }),
  );
}

it("concurrent writes never share a spot, and every seal sits on a listed spot", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => write(marker(`spot-${i}`))));
  const seals = await paintingSeals();
  const positions = seals.map((s) => `${s.left},${s.top}`);
  expect(new Set(positions).size).toBe(positions.length);
  expect(seals.length).toBeLessThanOrEqual(SPOTS.length);
  const listed = new Set(SPOTS.map((s) => `${(s.x * 100).toFixed(2)},${(s.y * 100).toFixed(2)}`));
  for (const p of positions) expect(listed).toContain(p);
});

it("once the spots run out, a new line keeps its seal in the list only", { timeout: 30000 }, async () => {
  while ((await paintingSeals()).length < SPOTS.length) {
    await Promise.all(Array.from({ length: 8 }, () => write(marker("filling"))));
  }
  const line = marker("no-room");
  const res = await write(line);
  const id = res.headers.get("location")!.replace("/#c-", "");
  const text = await (await fetch(new URL("/", baseUrl))).text();
  expect(text).toContain(`id="c-${id}"`);
  expect(text).not.toContain(`href="#c-${id}"`);
  expect(await paintingSeals()).toHaveLength(SPOTS.length);
});
