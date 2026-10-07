import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";
import { marker, newVisitor, openStream, parse, write } from "./sse.ts";

// Visitors carve their own seal by tracing a small-seal guide. Nothing on the
// scroll can be deleted, so the server accepts a seal only if it follows its
// guide, validates every number at the boundary, and once a line carries the
// seal, it's fixed.
const baseUrl = inject("baseUrl");
const guides: Record<string, { mask: string[] }> = JSON.parse(readFileSync("public/guides/guides.json", "utf8"));
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
function trace(char: string): number[][][] {
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

async function carve(payload: unknown, cookie: string, raw?: string): Promise<Response> {
  return fetch(new URL("/seal", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: raw ?? JSON.stringify(payload),
  });
}

const hasCarvedSeal = async (cookie: string): Promise<boolean> => {
  const text = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const preview = text.slice(text.indexOf('class="desk-preview"'), text.indexOf("</form>"));
  return preview.includes('class="carved"');
};

it("an honest trace of the guide is accepted, for every character offered", { timeout: 30000 }, async () => {
  for (const char of Object.keys(guides)) {
    const cookie = await newVisitor();
    const res = await carve({ char, style: "zhu", strokes: trace(char) }, cookie);
    expect(res.status, `tracing ${char}`).toBe(201);
    expect((await res.json()).mark).toContain('class="carved"');
  }
});

it("a scribble, a shape outside the guide, another character, and an empty seal are refused", async () => {
  const cookie = await newVisitor();
  const circle = [Array.from({ length: 120 }, (_, i) => [500 + Math.round(430 * Math.cos(i / 19)), 500 + Math.round(430 * Math.sin(i / 19))])];
  const scribble = [Array.from({ length: 200 }, (_, i) => [(i * 137) % 1000, (i * 251) % 1000])];
  for (const strokes of [circle, scribble, trace("鑑")]) {
    const res = await carve({ char: "山", style: "zhu", strokes }, cookie);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Trace the character's strokes; your seal needs to follow the guide.");
  }
  expect((await carve({ char: "山", style: "zhu", strokes: [] }, cookie)).status).toBe(400);
  expect(await hasCarvedSeal(cookie), "nothing refused is stored").toBe(false);
});

it("rejects every malformed field whole, never trimmed, and stores nothing", async () => {
  const cookie = await newVisitor();
  const good = trace("山");
  const cases: unknown[] = [
    { char: "山", style: "zhu", strokes: [[["500", 500]]] }, // a non-number
    { char: "山", style: "zhu", strokes: [[[500.5, 500]]] }, // not an integer
    { char: "山", style: "zhu", strokes: [[[1001, 500]]] }, // out of range
    { char: "山", style: "zhu", strokes: [[[-1, 500]]] },
    { char: "山", style: "zhu", strokes: Array.from({ length: 25 }, () => [[500, 500]]) }, // too many strokes
    { char: "山", style: "zhu", strokes: [Array.from({ length: 301 }, () => [500, 500])] }, // too many in one
    { char: "山", style: "zhu", strokes: Array.from({ length: 6 }, () => Array.from({ length: 300 }, () => [500, 500])) }, // too many in all
    { char: "<script>", style: "zhu", strokes: good }, // markup, unknown character
    { char: "山", style: "<b>zhu</b>", strokes: good }, // markup, unknown style
    { char: "山", style: "zhu", strokes: good, name: "<img src=x>" }, // an extra field
    { char: "山", style: "zhu", strokes: [[[500, 500, 9]]] }, // a point with three numbers
    ["山", "zhu", good],
  ];
  for (const payload of cases) {
    const res = await carve(payload, cookie);
    expect(res.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
  }
  expect((await carve(null, cookie, "{not json")).status).toBe(400);
  expect(await hasCarvedSeal(cookie)).toBe(false);
});

it("has its own body cap, above the 16 KB every other route keeps, and refuses past it unparsed", async () => {
  const cookie = await newVisitor();
  // 20 KB: over the general cap, under the seal route's, so it's parsed (and refused as a seal).
  const midsize = await carve(null, cookie, JSON.stringify({ char: "山", style: "zhu", strokes: [[[1, 1]]], pad: "x".repeat(20000) }));
  expect(midsize.status).toBe(400);
  // 40 KB: refused before parsing, so not even valid JSON matters.
  const huge = await carve(null, cookie, "{".repeat(40 * 1024));
  expect(huge.status).toBe(413);
});

async function interval(): Promise<number> {
  const page = await (await fetch(new URL("/", baseUrl))).text();
  return Number(page.match(/data-interval-seconds="([\d.]+)"/)![1]);
}

const randomIp = (): string => `198.20.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

it("a seal can be redone until a line carries it, then it's fixed, and the live event carries the drawing, not the token", async () => {
  const cookie = await newVisitor();
  expect((await carve({ char: "山", style: "zhu", strokes: trace("山") }, cookie)).status).toBe(201);
  expect((await carve({ char: "水", style: "bai", strokes: trace("水") }, cookie)).status, "redo before use").toBe(201);

  const watcher = await openStream("/events", { cookie: await newVisitor() });
  await watcher.waitFor(() => watcher.retry !== undefined);
  const line = marker("carved-line");
  expect((await write(line, { cookie, ip: randomIp() })).status).toBe(303);
  const event = await watcher.next((e) => e.event === "colophon" && parse(e).html.includes(line));
  watcher.close();
  expect(parse(event).html).toContain('class="carved"');
  // Its seal on the painting is carved too, if a spot was left for it.
  if (parse(event).seal) expect(parse(event).seal).toContain('class="carved"');
  expect(event.data).not.toContain(cookie.split("=")[1]!);

  expect((await carve({ char: "山", style: "zhu", strokes: trace("山") }, cookie)).status).toBe(409);
  expect((await carve({ clear: true }, cookie)).status).toBe(409);
});

it("lines written before a visitor carved keep their generated glyph", { timeout: 20000 }, async () => {
  const wait = await interval();
  expect(wait, "this check writes twice from one seal, so it needs a short interval (CI sets 3 s)").toBeLessThanOrEqual(10);
  const cookie = await newVisitor();
  const ip = randomIp();
  const before = marker("before-carving");
  expect((await write(before, { cookie, ip })).status).toBe(303);
  expect((await carve({ char: "月", style: "zhu", strokes: trace("月") }, cookie)).status).toBe(201);
  await new Promise((r) => setTimeout(r, wait * 1000 + 300));
  const after = marker("after-carving");
  expect((await write(after, { cookie, ip })).status).toBe(303);

  const text = await (await fetch(new URL("/", baseUrl))).text();
  const entry = (m: string): string => {
    const at = text.indexOf(m);
    return text.slice(text.lastIndexOf("<li", at), text.indexOf("</li>", at));
  };
  expect(entry(before)).not.toContain('class="carved"');
  expect(entry(after)).toContain('class="carved"');
});
