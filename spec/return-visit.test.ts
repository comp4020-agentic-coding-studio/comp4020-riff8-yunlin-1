import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";
import { marker, write } from "./sse.ts";

// What someone sees when they come back: lines other people wrote since their
// last visit are quietly marked, and on a first visit the painting unrolls.
const baseUrl = inject("baseUrl");

// A tiny cookie jar: fetch keeps none across calls.
async function visit(jar: Map<string, string>): Promise<string> {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(new URL("/", baseUrl), { headers: cookie ? { Cookie: cookie } : {} });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
  }
  return res.text();
}

const newEntries = (html: string): string[] =>
  [...html.matchAll(/<li class="[^"]*colophon--new[^"]*"[^>]*>[\s\S]*?<\/li>/g)].map((m) => m[0]);

it("marks exactly the lines other people wrote since the last visit, once", async () => {
  const jar = new Map<string, string>();
  const first = await visit(jar);
  expect(newEntries(first), "a first visit marks nothing").toHaveLength(0);
  expect(first).not.toContain("since your last visit");

  const lines = [marker("since-a"), marker("since-b")];
  for (const line of lines) await write(line);
  // A line this browser writes itself is never new to it.
  const own = marker("since-own");
  await fetch(new URL("/colophons", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `seal=${jar.get("seal")}`,
      "Fly-Client-IP": "198.19.0.1",
    },
    body: new URLSearchParams({ body: own }).toString(),
  });

  const second = await visit(jar);
  const marked = newEntries(second);
  expect(marked).toHaveLength(2);
  expect(marked[0]).toContain(lines[0]);
  expect(marked[1]).toContain(lines[1]);
  expect(second.indexOf("since your last visit")).toBeLessThan(second.indexOf(lines[0]!));
  expect(second.match(/since your last visit/g)).toHaveLength(1);

  const third = await visit(jar);
  expect(newEntries(third)).toHaveLength(0);
  expect(third).not.toContain("since your last visit");
});

const unrolls = (html: string): boolean => /class="scroll-frame[^"]*\bunroll\b/.test(html);

it("the painting unrolls only on the request that issues a seal", async () => {
  const jar = new Map<string, string>();
  expect(unrolls(await visit(jar))).toBe(true);
  expect(unrolls(await visit(jar))).toBe(false);
});

it("the unroll is turned off under prefers-reduced-motion", () => {
  const css = readFileSync("public/styles.css", "utf8");
  const reduced = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("");
  expect(reduced).toMatch(/\.unroll[^{]*\{[^}]*animation:\s*none/);
});
