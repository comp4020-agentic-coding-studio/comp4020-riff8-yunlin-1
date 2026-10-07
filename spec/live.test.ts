import { expect, inject, it } from "vitest";
import { marker, newVisitor, openStream, parse, write, type SseEvent } from "./sse.ts";

// The live layer: a line written anywhere reaches every open scroll within a
// second, marked as yours only where you wrote it, escaped on the way, and
// never lost or doubled across a reconnect.
const baseUrl = inject("baseUrl");

const carrying = (text: string) => (e: SseEvent) => e.event === "colophon" && parse(e).html.includes(text);

it("GET /events is a server-sent-events stream that starts with a retry: line", async () => {
  const s = await openStream();
  try {
    expect(s.status).toBe(200);
    expect(s.contentType).toMatch(/^text\/event-stream/);
    await s.waitFor(() => s.retry !== undefined);
  } finally {
    s.close();
  }
});

it("a line written by another client reaches two open streams in under a second", async () => {
  const a = await openStream("/events", { cookie: await newVisitor() });
  const b = await openStream("/events", { cookie: await newVisitor() });
  try {
    await Promise.all([a.waitFor(() => a.retry !== undefined), b.waitFor(() => b.retry !== undefined)]);
    const line = marker("live");
    const sent = performance.now();
    const res = await write(line, { cookie: await newVisitor() });
    expect(res.status).toBe(303);
    const [ea, eb] = await Promise.all([a.next(carrying(line), 1000), b.next(carrying(line), 1000)]);
    expect(ea.at - sent).toBeLessThan(1000);
    expect(eb.at - sent).toBeLessThan(1000);
  } finally {
    a.close();
    b.close();
  }
});

it("a live line is marked yours only on the writer's own stream, and the token never travels", async () => {
  const author = await newVisitor();
  const mine = await openStream("/events", { cookie: author });
  const theirs = await openStream("/events", { cookie: await newVisitor() });
  try {
    await Promise.all([mine.waitFor(() => mine.retry !== undefined), theirs.waitFor(() => theirs.retry !== undefined)]);
    const line = marker("yours-live");
    await write(line, { cookie: author });
    const [own, other] = await Promise.all([mine.next(carrying(line)), theirs.next(carrying(line))]);
    expect(parse(own).html).toContain("colophon--mine");
    expect(parse(own).html).toContain("— yours");
    expect(parse(other).html).not.toContain("colophon--mine");
    expect(parse(other).html).not.toContain("— yours");

    const token = author.split("=")[1]!;
    expect(mine.raw).not.toContain(token);
    expect(theirs.raw).not.toContain(token);
  } finally {
    mine.close();
    theirs.close();
  }
});

it("a live line arrives escaped", async () => {
  const s = await openStream();
  try {
    await s.waitFor(() => s.retry !== undefined);
    const tag = marker("esc");
    const nasty = `${tag} <script>alert(1)</script> & done`;
    await write(nasty);
    const e = await s.next(carrying(tag));
    const html = parse(e).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; done");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
  } finally {
    s.close();
  }
});

async function lastRenderedId(): Promise<number> {
  const text = await (await fetch(new URL("/", baseUrl))).text();
  const m = text.match(/data-last-id="(\d+)"/);
  expect(m, "the page records the highest id it rendered").toBeTruthy();
  return Number(m![1]);
}

it("a line written between the page loading and the stream connecting is replayed", async () => {
  const rendered = await lastRenderedId();
  const line = marker("gap");
  await write(line);
  const s = await openStream(`/events?after=${rendered}`);
  try {
    const e = await s.next(carrying(line));
    expect(Number(e.id)).toBeGreaterThan(rendered);
  } finally {
    s.close();
  }
});

it("reconnecting with a stale Last-Event-ID replays exactly what was missed, in order, once each", async () => {
  const first = marker("before");
  const s1 = await openStream();
  await s1.waitFor(() => s1.retry !== undefined);
  await write(first);
  const seen = await s1.next(carrying(first));
  s1.close();

  // Missed while away...
  const missed = Array.from({ length: 6 }, (_, i) => marker(`missed-${i}`));
  await Promise.all(missed.map((m) => write(m)));

  // ...and more written concurrently with the reconnect itself.
  const during = Array.from({ length: 6 }, (_, i) => marker(`during-${i}`));
  const s2Promise = openStream("/events", { lastEventId: seen.id! });
  await Promise.all(during.map((m) => write(m)));
  const s2 = await s2Promise;
  try {
    const all = [...missed, ...during];
    await s2.waitFor(() => all.every((m) => s2.events.some(carrying(m))));
    const ids = s2.events.filter((e) => e.event === "colophon").map((e) => Number(e.id));
    expect(ids.every((id, i) => i === 0 || id > ids[i - 1]!), "ids strictly increasing").toBe(true);
    expect(ids[0]).toBe(Number(seen.id) + 1);
    for (const m of all) expect(s2.events.filter(carrying(m))).toHaveLength(1);
    expect(s2.events.some(carrying(first)), "nothing already seen is resent").toBe(false);
  } finally {
    s2.close();
  }
});

it("a presence event carries the number and nothing else, with no id to move Last-Event-ID", async () => {
  const s = await openStream("/events", { cookie: await newVisitor() });
  try {
    const e = await s.next((e) => e.event === "presence");
    expect(e.data).toMatch(/^\d+$/);
    expect(e.id).toBeUndefined();
  } finally {
    s.close();
  }
});
