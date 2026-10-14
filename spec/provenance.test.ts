import { expect, inject, it } from "vitest";
import { handle, sealTag } from "../src/seal.ts";
import { fakeIp, marker, openStream } from "./sse.ts";
import { trace } from "./trace.ts";

// Crit 10: two people, each in their own browser, use the scroll side by side
// and someone reading only the logs says who did what. So every action is one
// provenance line naming the visitor by the handle the page shows beside
// their seal, no line ever carries a token, and one visitor can't change what
// is the other's. The app's stdout is in another process (a container, in
// CI), so the spec reads the same lines back from the in-memory copy the app
// keeps only when PROVENANCE_SPEC_KEY is set; see src/provenance.ts.
const baseUrl = inject("baseUrl");
const KEY = process.env.PROVENANCE_SPEC_KEY ?? "";

// A visitor with their own cookie jar, the way a separate Chrome profile is.
class Visitor {
  cookie = "";
  readonly ip = fakeIp();
  get token(): string {
    return this.cookie.replace(/^seal=/, "");
  }
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(new URL(path, baseUrl), {
      redirect: "manual",
      ...init,
      headers: { "Fly-Client-IP": this.ip, ...(this.cookie ? { Cookie: this.cookie } : {}), ...init.headers },
    });
    const seal = res.headers.getSetCookie().find((c) => c.startsWith("seal="));
    if (seal) this.cookie = seal.split(";")[0]!;
    return res;
  }
  async page(): Promise<string> {
    return (await this.fetch("/")).text();
  }
  write(body: string): Promise<Response> {
    return this.fetch("/colophons", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ body }).toString(),
    });
  }
  seal(payload: unknown): Promise<Response> {
    return this.fetch("/seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}

// The provenance lines logged after the first `after` (all of them by
// default), and how many there have been in all.
async function read(after = 0): Promise<{ total: number; lines: string[] }> {
  const res = await fetch(new URL(`/_provenance?after=${after}`, baseUrl), { headers: { "x-provenance-key": KEY } });
  expect(res.status, "start the app with PROVENANCE_SPEC_KEY set, and the spec with the same value").toBe(200);
  return { total: Number(res.headers.get("x-provenance-total")), lines: (await res.text()).split("\n").filter(Boolean) };
}

const mark = async (): Promise<number> => (await read()).total;
const rawSince = async (n: number): Promise<string> => (await read(n)).lines.join("\n");

// key=value pairs, with "quoted" values for anything holding a space.
function fields(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g)) out[m[1]!] = m[2]!.startsWith('"') ? JSON.parse(m[2]!) : m[2]!;
  return out;
}

async function linesSince(n: number): Promise<Record<string, string>[]> {
  const { lines } = await read(n);
  for (const line of lines) expect(line).toMatch(/^provenance at=\S+ action=\S+ outcome=\S+ who=\S+/);
  return lines.map(fields);
}

const handleOn = (page: string): string => page.match(/class="handle own-handle"[^>]*>([^<]+)</)![1]!;

it("two browsers get different handles, shown on the page and named in the log", async () => {
  const before = await mark();
  const a = new Visitor();
  const b = new Visitor();
  const pageA = await a.page();
  const pageB = await b.page();
  expect(a.token).not.toBe(b.token);

  const ha = handleOn(pageA);
  const hb = handleOn(pageB);
  expect(ha).toBe(handle(a.token));
  expect(hb).toBe(handle(b.token));
  expect(ha).not.toBe(hb);
  expect(pageA).not.toContain(a.token);

  const issued = (await linesSince(before)).filter((l) => l.action === "seal-issued");
  expect(issued.map((l) => l.who)).toEqual(expect.arrayContaining([ha, hb]));
});

it("tags are four hex digits of a one-way hash, and almost never collide", () => {
  const tags = new Set(Array.from({ length: 200 }, () => sealTag(crypto.randomUUID())));
  for (const t of tags) expect(t).toMatch(/^[0-9a-f]{4}$/);
  expect(tags.size).toBeGreaterThan(195);
});

it("each visitor's actions are logged under their own handle, and B can't change A's seal", { timeout: 20000 }, async () => {
  const a = new Visitor();
  const b = new Visitor();
  await a.page();
  await b.page();
  const start = await mark();

  // A carves a seal and writes a line with it, which fixes it.
  expect((await a.seal({ char: "山", style: "zhu", strokes: trace("山") })).status).toBe(201);
  const ha = handle(a.token, "山");
  const lineA = marker("provenance-a");
  const wrote = await a.write(lineA);
  expect(wrote.status).toBe(303);
  const idA = Number(wrote.headers.get("location")!.replace("/#c-", ""));

  // B carves and clears their own seal (allowed: it's theirs, and unused).
  expect((await b.seal({ char: "水", style: "bai", strokes: trace("水") })).status).toBe(201);
  expect((await b.seal({ clear: true })).status).toBe(200);

  // B tries A's seal: the only seal a request can touch is its own cookie's,
  // so B's attempt changes B's seal and A's stays carved and fixed.
  expect((await b.seal({ char: "鑑", style: "zhu", strokes: trace("鑑") })).status).toBe(201);
  expect((await b.seal({ clear: true })).status).toBe(200);
  expect((await a.seal({ clear: true })).status, "A's own seal is fixed now").toBe(409);
  expect((await a.seal({ char: "水", style: "zhu", strokes: trace("水") })).status).toBe(409);

  // Refusals: an empty line, an over-long one, wet ink, a malformed seal.
  expect((await b.write("  ")).status).toBe(400);
  expect((await b.write("x".repeat(400))).status).toBe(400);
  expect((await a.write(marker("too-soon"))).status).toBe(429);
  expect((await b.seal({ char: "山", style: "zhu", strokes: [[[1, 1]]] })).status).toBe(400);

  const pageB = await b.page();
  const entry = pageB.slice(pageB.indexOf(`id="c-${idA}"`), pageB.indexOf("</li>", pageB.indexOf(`id="c-${idA}"`)));
  expect(entry, "A's line shows A's handle, to B too").toContain(ha);
  expect(entry).toContain('class="carved"');

  const lines = await linesSince(start);
  // A handle's character follows the seal (carving changes it); its tag
  // never does, so that's what follows one person down the log.
  const by = (v: Visitor) =>
    lines.filter((l) => l.who!.endsWith(`·${sealTag(v.token)}`)).map((l) => `${l.action}:${l.outcome}:${l.reason ?? ""}`);
  expect(lines.find((l) => l.action === "seal" && l.outcome === "carved" && l.now === ha)?.who).toBe(handle(a.token));
  expect(lines.find((l) => l.action === "write" && l.outcome === "ok" && l.colophon === String(idA))?.who).toBe(ha);
  expect(by(a)).toEqual(expect.arrayContaining(["seal-clear:refused:fixed", "seal:refused:fixed", "write:refused:wet-ink"]));
  expect(by(b)).toEqual(expect.arrayContaining(["seal-clear:ok:", "write:refused:empty", "write:refused:long", "seal:refused:untraced"]));
  expect(by(b)).not.toContain("write:ok:");

  const raw = await rawSince(start);
  expect(raw).not.toContain(a.token);
  expect(raw).not.toContain(b.token);
  expect(raw, "the log names the line by id, never by its text").not.toContain(lineA);
  expect(raw).not.toContain(a.ip);
});

it("no route edits or deletes a colophon, whoever asks", async () => {
  const a = new Visitor();
  await a.page();
  const line = marker("permanent");
  const res = await a.write(line);
  const id = res.headers.get("location")!.replace("/#c-", "");
  for (const v of [a, new Visitor()]) {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      for (const path of [`/colophons/${id}`, "/colophons"]) {
        expect((await v.fetch(path, { method, body: "body=changed" })).status).toBe(404);
      }
    }
  }
  expect(await a.page()).toContain(line);
});

it("a live stream opening and closing is logged under the viewer's handle", async () => {
  const v = new Visitor();
  await v.page();
  const start = await mark();
  const stream = await openStream("/events", { cookie: v.cookie });
  await stream.waitFor(() => stream.retry !== undefined);
  stream.close();
  const who = handle(v.token);
  for (let i = 0; i < 40; i++) {
    const lines = await linesSince(start);
    if (lines.some((l) => l.action === "stream" && l.outcome === "closed" && l.who === who)) {
      expect(lines.some((l) => l.action === "stream" && l.outcome === "opened" && l.who === who)).toBe(true);
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("no stream-closed line");
});

it("a cookie this server never issued is replaced, and that's logged too", async () => {
  const start = await mark();
  const v = new Visitor();
  v.cookie = "seal=not-a-real-token";
  await v.page();
  expect(v.token).not.toBe("not-a-real-token");
  const lines = await linesSince(start);
  expect(lines.find((l) => l.who === handle(v.token))?.outcome).toBe("replaced-invalid-cookie");
  expect(await rawSince(start)).not.toContain("not-a-real-token");
});

it("the log is not public: without the key the route doesn't exist", async () => {
  expect((await fetch(new URL("/_provenance", baseUrl))).status).toBe(404);
  expect((await fetch(new URL("/_provenance", baseUrl), { headers: { "x-provenance-key": "guess" } })).status).toBe(404);
});

it("placing a seal, and being refused a spot, are both provenance lines", async () => {
  const start = await mark();
  const v = new Visitor();
  await v.page();
  await v.write(marker("placed"));
  const refused = await v.fetch("/colophons", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ body: marker("refused-spot"), spot: "0" }).toString(),
  });
  expect([409, 429]).toContain(refused.status); // wet ink is checked first on a second write
  const other = new Visitor();
  await other.page();
  const r2 = await other.fetch("/colophons", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ body: marker("refused-spot"), spot: "0" }).toString(),
  });
  expect(r2.status).toBe(409);
  const lines = await linesSince(start);
  const place = lines.find((l) => l.action === "place" && l.who === handle(v.token));
  expect(place?.outcome).toBe("ok");
  expect(place?.how).toMatch(/^(first-free|no-free-spot)$/);
  expect(lines.find((l) => l.action === "write" && l.outcome === "refused" && l.who === handle(other.token))).toMatchObject({
    reason: "taken",
    spot: "0",
  });
});
