import { expect, it } from "vitest";
import { newVisitor, openStream, type Stream } from "./sse.ts";

// 過眼: how many distinct browsers have the scroll open right now. One person
// with several tabs counts once, and a closed tab drops out within a few
// seconds. Counts are compared to a baseline, not asserted absolutely, so a
// browser left open on the app while the spec runs can't fail it.
const latestCount = (s: Stream): number =>
  Number(s.events.filter((e) => e.event === "presence").at(-1)?.data ?? NaN);

async function settlesAt(s: Stream, n: number): Promise<void> {
  await s.waitFor(() => latestCount(s) === n, 6000);
}

it("counts distinct seals, not tabs, and falls back when one closes", { timeout: 30000 }, async () => {
  const watcher = await openStream("/events", { cookie: await newVisitor() });
  try {
    await watcher.next((e) => e.event === "presence");
    // Let any throttled update from earlier specs land before taking the baseline.
    await new Promise((r) => setTimeout(r, 2500));
    const base = latestCount(watcher);
    expect(base).toBeGreaterThanOrEqual(1);

    const other = await newVisitor();
    const b1 = await openStream("/events", { cookie: other });
    await settlesAt(watcher, base + 1);

    const b2 = await openStream("/events", { cookie: other });
    await b2.next((e) => e.event === "presence");
    await new Promise((r) => setTimeout(r, 2500));
    expect(latestCount(watcher), "a second tab with the same seal still counts once").toBe(base + 1);

    b2.close();
    await new Promise((r) => setTimeout(r, 2500));
    expect(latestCount(watcher), "one of two tabs closing leaves that browser counted").toBe(base + 1);

    const closedAt = performance.now();
    b1.close();
    await settlesAt(watcher, base);
    expect(performance.now() - closedAt).toBeLessThan(5000);
  } finally {
    watcher.close();
  }
});

it("every presence event is a bare number", { timeout: 15000 }, async () => {
  const s = await openStream("/events", { cookie: await newVisitor() });
  const t = await openStream("/events", { cookie: await newVisitor() });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    t.close();
    await new Promise((r) => setTimeout(r, 2500));
    const presence = s.events.filter((e) => e.event === "presence");
    expect(presence.length).toBeGreaterThan(0);
    for (const e of presence) expect(e.data).toMatch(/^\d+$/);
  } finally {
    s.close();
    t.close();
  }
});
