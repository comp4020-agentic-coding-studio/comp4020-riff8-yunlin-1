import { expect, inject, it } from "vitest";
import { openStream, type Stream } from "./sse.ts";

// One shared-cpu-1x machine with 256 MB holds every open stream in memory, so
// streams are capped, cleaned up when they close, and kept alive through
// Fly's proxy with a heartbeat.
const baseUrl = inject("baseUrl");

it("sends a heartbeat comment at least every 20 seconds", { timeout: 25000 }, async () => {
  const s = await openStream();
  try {
    await s.waitFor(() => s.comments.length > 0, 20000);
  } finally {
    s.close();
  }
});

it("refuses streams past the cap with a 503, and opening and aborting hundreds leaves it answering", { timeout: 60000 }, async () => {
  const opened: Stream[] = [];
  try {
    for (let batch = 0; batch < 6; batch++) {
      opened.push(...(await Promise.all(Array.from({ length: 50 }, () => openStream()))));
    }
    const statuses = opened.map((s) => s.status);
    expect(statuses.every((code) => code === 200 || code === 503)).toBe(true);
    expect(statuses.filter((code) => code === 503).length, "300 at once is past the cap").toBeGreaterThan(0);
  } finally {
    for (const s of opened) s.close();
  }

  // Closed streams are dropped, so a new one gets in again.
  await new Promise((r) => setTimeout(r, 1000));
  expect((await fetch(new URL("/", baseUrl))).status).toBe(200);
  const after = await openStream();
  try {
    expect(after.status).toBe(200);
    await after.waitFor(() => after.retry !== undefined);
  } finally {
    after.close();
  }
});
