import { createHash } from "node:crypto";

// A visitor's seal is one character drawn deterministically from their
// anonymous token, from a small pool of words real Chinese collectors' and
// connoisseurs' seals use for looking, keeping, and inscribing (鑑賞 "to
// appraise", 珍藏 "to treasure and keep", 過眼 "passed before the eye",
// 題記 "to inscribe a note" among them). It stands in for a name without
// being one.
const GLYPHS = ["鑑", "賞", "藏", "觀", "閱", "記", "題", "珍", "玩", "守", "傳", "校"];

export function sealGlyph(token: string): string {
  let hash = 0;
  for (const ch of token) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return GLYPHS[hash % GLYPHS.length]!;
}

// Twelve glyphs (and a choice of 31 seal characters) collide often, so a seal
// alone can't tell two visitors apart. The tag can: four hex digits of a
// one-way hash of the token, stable for that browser, saying nothing about
// the token itself. 65,536 tags, so a room of visitors almost never shares one.
export function sealTag(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 4);
}

// The public handle: the seal's character and its tag, as the page shows it
// beside the seal and as the provenance log names the visitor.
export function handle(token: string, char: string = sealGlyph(token)): string {
  return `${char}·${sealTag(token)}`;
}
