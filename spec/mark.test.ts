import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, inject, it } from "vitest";
import { SPOTS } from "../src/spots.ts";
import { fakeIp, marker, newVisitor } from "./sse.ts";
import { trace } from "./trace.ts";

// Making a mark in three steps: a seal (generated, ready-made or carved), a
// spot on the painting, and a line, saved together in one write. The server
// decides the spot: it has to be a listed spot and still free at the moment
// of writing, so of two people choosing one spot the first wins, and the
// second gets a clear message with their draft kept.
const baseUrl = inject("baseUrl");

// The write itself, in-process against a scratch database, since the spots
// on the running app are shared with every other spec file and run out.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "colophon-mark-")), "c.db");
const db = await import("../src/db.ts");

it("a chosen free spot is used, a taken one refused, and no choice takes the first free", () => {
  const a = db.addColophon(crypto.randomUUID(), "a", { spot: 5 });
  expect(a.ok && a.spot).toBe(5);
  expect(a.ok && [a.row.spot_x, a.row.spot_y]).toEqual([SPOTS[5]!.x, SPOTS[5]!.y]);
  expect(db.addColophon(crypto.randomUUID(), "b", { spot: 5 })).toEqual({ ok: false, reason: "taken" });
  const c = db.addColophon(crypto.randomUUID(), "c");
  expect(c.ok && c.spot).toBe(0);
  expect(db.freeSpotsNow()).not.toContain(5);
  expect(db.freeSpotsNow()).not.toContain(0);
});

it("a ready-made seal is saved with the line and fixed by it; a generated choice drops an unused seal", () => {
  const t = crypto.randomUUID();
  const r = db.addColophon(t, "ready", { seal: { char: "山", style: "bai" } });
  expect(r.ok && [r.row.seal_char, r.row.seal_style, r.row.seal_strokes]).toEqual(["山", "bai", "[]"]);
  expect(db.addColophon(t, "again", { seal: { char: "水", style: "zhu" } })).toEqual({ ok: false, reason: "fixed" });
  expect(db.addColophon(t, "again", { seal: "generated" })).toEqual({ ok: false, reason: "fixed" });

  const u = crypto.randomUUID();
  db.saveSeal(u, "月", "zhu", JSON.stringify([[[1, 1]]]));
  const g = db.addColophon(u, "plain", { seal: "generated" });
  expect(g.ok && g.row.seal_id).toBeNull();
  expect(db.addColophon(crypto.randomUUID(), "x", { seal: "carved" })).toEqual({ ok: false, reason: "uncarved" });
});

it("a refused write saves nothing, not even the seal it asked for", () => {
  const t = crypto.randomUUID();
  const before = db.listColophons().length;
  expect(db.addColophon(t, "late", { spot: 5, seal: { char: "山", style: "zhu" } }).ok).toBe(false);
  expect(db.listColophons()).toHaveLength(before);
  expect(db.currentSeal(t)).toBeUndefined();
});

// Over HTTP, against the running app.
async function post(cookie: string, fields: Record<string, string>, json = false): Promise<Response> {
  return fetch(new URL("/colophons", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Fly-Client-IP": fakeIp(),
      Cookie: cookie,
      ...(json ? { Accept: "application/json" } : {}),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

const freeOnPage = (html: string): number[] =>
  [...html.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));

it("a spot someone already holds is refused with a clear message, and the draft comes back", async () => {
  await post(await newVisitor(), { body: marker("hold-spot-0") }); // spot 0 is the first ever handed out
  const line = marker("wants-spot-0");
  const res = await post(await newVisitor(), { body: line, spot: "0" });
  expect(res.status).toBe(409);
  const page = await res.text();
  expect(page).toContain("That spot was just taken. Choose another; your line is still here.");
  expect(page).toContain(`>${line}</textarea>`);
  expect(page).not.toMatch(/<option value="0"/);

  const json = await post(await newVisitor(), { body: line, spot: "0" }, true);
  expect(json.status).toBe(409);
  expect(await json.json()).toMatchObject({ error: "taken", freeSpots: expect.any(Array) });
});

it("two people choosing the same free spot at once: the first wins, the second is refused", async () => {
  const free = freeOnPage(await (await fetch(new URL("/", baseUrl))).text());
  if (free.length === 0) return; // every spot is taken already; the in-process test covers this
  const spot = String(free.at(-1));
  const [a, b] = await Promise.all([
    post(await newVisitor(), { body: marker("race-a"), spot }),
    post(await newVisitor(), { body: marker("race-b"), spot }),
  ]);
  expect([a.status, b.status].sort()).toEqual([303, 409]);
});

it("a spot or seal that isn't on offer is refused whole, never guessed at", async () => {
  const cookie = await newVisitor();
  for (const fields of <Record<string, string>[]>[
    { spot: String(SPOTS.length) },
    { spot: "-1" },
    { spot: "0.5" },
    { seal: "ready", char: "<b>", style: "zhu" },
    { seal: "ready", char: "山", style: "red" },
    { seal: "someone-elses" },
  ]) {
    const res = await post(cookie, { body: marker("bad-choice"), ...fields });
    expect(res.status, JSON.stringify(fields)).toBe(400);
  }
});

it("a ready-made seal chosen over HTTP carries the line, and the handle follows it", async () => {
  const cookie = await newVisitor();
  const line = marker("ready-made");
  const res = await post(cookie, { body: line, seal: "ready", char: "松", style: "zhu" });
  expect(res.status).toBe(303);
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const at = html.indexOf(line);
  const entry = html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
  expect(entry).toContain('class="carved ready"');
  expect(entry).toMatch(/class="handle"[^>]*>松·[0-9a-f]{4}</);

  // Fixed now: a carved seal can't replace it.
  const carve = await fetch(new URL("/seal", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ char: "山", style: "zhu", strokes: trace("山") }),
  });
  expect(carve.status).toBe(409);
});
