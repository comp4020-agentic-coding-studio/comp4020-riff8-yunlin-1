import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// CLAUDE.md states a rule this stylesheet already broke once (found and fixed
// in the same commit as this test): "if the accent colour (--seal) gets a
// second meaning beyond 'this colophon is yours,' that's a sign the design
// has drifted, not a sign to add a second colour." A prior crit's own --seal
// drifted into an unrelated .error banner unnoticed for several runs (see
// ../memory/MEMORY.md) because every check reasoned about the accent from the
// colophon markup, never by rereading the whole stylesheet for each use. This
// greps every var(--seal) directly so a future edit can't reintroduce that
// silently, the same way a patched line with no test behind it did last time.
const css = readFileSync("public/styles.css", "utf8");

// .painting-seal--mine is the same meaning in a second place: your own seal,
// stamped on the painting (prompt item 14). Everyone else's seal there is ink.
const ALLOWED_SELECTORS = [".colophon--mine .colophon-seal", ".colophon--mine .colophon-date", ".painting-seal--mine"];

it("var(--seal) marks only a colophon that belongs to the current browser", () => {
  const rules = css
    .split("}")
    .map((rule) => rule.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const rule of rules) {
    if (!rule.includes("var(--seal)")) continue;
    const selector = rule.split("{")[0]!.trim();
    expect(ALLOWED_SELECTORS, `unexpected var(--seal) use in "${selector}"`).toContain(selector);
  }
});
