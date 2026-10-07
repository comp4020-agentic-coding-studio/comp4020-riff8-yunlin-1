import { expect, inject, it } from "vitest";
import { fakeIp, marker, newVisitor, write } from "./sse.ts";

// Live delivery makes a flood worse, and nothing on the scroll can be deleted,
// so writing is limited at the boundary: one line per seal per interval, and
// a daily allowance per client address. The limits are configurable (CI
// relaxes the per-IP one so the load specs can run from one machine); these
// tests read whatever the app was started with off the form and prove that.
const baseUrl = inject("baseUrl");
const WET = "The ink is still wet on your last line. Give it a few minutes.";

async function limits(): Promise<{ interval: number; ipDaily: number }> {
  const text = await (await fetch(new URL("/", baseUrl))).text();
  const interval = text.match(/data-interval-seconds="(\d+(?:\.\d+)?)"/);
  const ipDaily = text.match(/data-ip-daily="(\d+)"/);
  expect(interval && ipDaily, "the form states the limits it enforces").toBeTruthy();
  return { interval: Number(interval![1]), ipDaily: Number(ipDaily![1]) };
}

const onPage = async (text: string): Promise<boolean> =>
  (await (await fetch(new URL("/", baseUrl))).text()).includes(text);

it("one seal can't write a second line inside the interval", async () => {
  const { interval } = await limits();
  expect(interval).toBeGreaterThan(0);
  const cookie = await newVisitor();
  expect((await write(marker("first"), { cookie })).status).toBe(303);

  const second = marker("second");
  const res = await write(second, { cookie });
  expect(res.status).toBe(429);
  const page = await res.text();
  expect(page).toContain(WET);
  expect(page, "the visitor's text comes back in the textarea").toContain(`>${second}</textarea>`);
  expect(await onPage(second), "not stored").toBe(false);

  const json = await write(marker("second-json"), { cookie, json: true });
  expect(json.status).toBe(429);
  expect((await json.json()).message).toBe(WET);
});

it("one address can't write more than its daily allowance, even dropping its cookie", { timeout: 60000 }, async () => {
  const { ipDaily } = await limits();
  const ip = fakeIp();
  for (let done = 0; done < ipDaily; done += 50) {
    const batch = Array.from({ length: Math.min(50, ipDaily - done) }, () => write(marker("allowance"), { ip }));
    for (const res of await Promise.all(batch)) expect(res.status).toBe(303);
  }

  const over = marker("over");
  const res = await write(over, { ip });
  expect(res.status).toBe(429);
  expect(await res.text()).toContain(WET);
  expect(await onPage(over), "not stored").toBe(false);

  // A different address is unaffected.
  expect((await write(marker("elsewhere"))).status).toBe(303);
});
