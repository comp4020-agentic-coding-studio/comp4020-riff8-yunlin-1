import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The page as an exhibition: every detail marker on the painting leads to a
// written note below it (so it works with no script), every motion has a
// reduced-motion off switch, and the desk says writing is for good.
const baseUrl = inject("baseUrl");

it("every detail marker links to a note in 'About this painting'", async () => {
  const text = await (await fetch(new URL("/", baseUrl))).text();
  const markers = [...text.matchAll(/class="detail-marker" href="#(detail-[a-z]+)"/g)].map((m) => m[1]!);
  expect(markers.length).toBeGreaterThanOrEqual(4);
  for (const id of markers) expect(text).toContain(`<li id="${id}">`);
  expect(text).toContain("dpm.org.cn/collection/paint/228452.html");
});

it("the desk says, before writing, that a line can't be taken back", async () => {
  const text = await (await fetch(new URL("/", baseUrl))).text();
  expect(text).toMatch(/can't be changed or taken back/);
});

it("every animation in the stylesheet is switched off under prefers-reduced-motion", () => {
  const css = readFileSync("public/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const [main, ...reducedBlocks] = css.split("@media (prefers-reduced-motion: reduce)");
  const reduced = reducedBlocks.join("");
  const animated = [...main!.matchAll(/([^{}]+)\{[^}]*\banimation:\s*(?!none)[^;]+;/g)].flatMap((m) =>
    m[1]!.split(",").map((sel) => sel.trim()),
  );
  expect(animated.length).toBeGreaterThan(0);
  for (const selector of animated) expect(reduced, `${selector} keeps moving`).toContain(selector);
});

// Script-only controls (zoom, details, full screen, the scroll hint, the
// carving tool) are served with the hidden attribute. A component rule such
// as display: flex outranks the browser's own [hidden] style, and did: with
// JavaScript off the zoom buttons showed and did nothing. This rule wins.
it("hidden means hidden, whatever display a component sets", () => {
  const css = readFileSync("public/styles.css", "utf8");
  expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
