import { escapeHtml } from "./html.ts";
import { handle, sealGlyph } from "./seal.ts";
import type { Colophon, SealRow } from "./db.ts";
import { GUIDES, READY_STROKES, renderStored } from "./carve.ts";
import { IMAGE_HEIGHT, SPOT_PLACES, SPOTS, spotIndex } from "./spots.ts";

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Australia/Canberra",
});

export const MAX_BODY_LENGTH = 320;

export type RejectReason = "empty" | "long" | "wet" | "taken" | "spot" | "seal" | "fixed" | "uncarved";

export const MESSAGES: Record<RejectReason, string> = {
  empty: "A colophon needs at least a few words.",
  long: `Keep it to ${MAX_BODY_LENGTH} characters — the margin is not infinite.`,
  wet: "The ink is still wet on your last line. Give it a few minutes.",
  taken: "That spot was just taken. Choose another; your line is still here.",
  spot: "That isn't a spot a seal can go. Choose one of the free spots.",
  seal: "Choose a seal: yours, a ready-made one, or one you've carved.",
  fixed: "Your seal is already on the scroll, so it can't be changed.",
  uncarved: "Carve your seal and keep it first, or choose another.",
};

// Who is reading a page or a stream: their own seal token (never sent back
// out, only compared) and, on a return visit, the highest colophon id they
// were shown last time.
export interface Viewer {
  token: string;
  seenUpTo?: number;
}

function layout(title: string, body: string, bodyClass = ""): string {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta
      name="description"
      content="Colophon: a shared margin on one painting, written a line at a time by whoever visits."
    />
    <link rel="icon" href="/public/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/public/styles.css" />
  </head>
  <body${bodyClass ? ` class="${bodyClass}"` : ""}>
    ${body}
  </body>
</html>
`;
}

// A line's seal: the one its writer carved, if they had by then, otherwise
// the generated glyph. Rendered from stored numbers or a fixed glyph list,
// never from visitor text.
function sealMark(c: Colophon, key: string): string {
  if (c.seal_char !== null && c.seal_style !== null && c.seal_strokes !== null) {
    return renderStored(c.seal_char, c.seal_style, c.seal_strokes, key);
  }
  return sealGlyph(c.token);
}

const sealName = (c: Colophon): string => c.seal_char ?? sealGlyph(c.token);

// The handle under a line: the seal it was written with and its writer's tag,
// the same words the provenance log names them by. Quiet, like the small
// inscription beside a seal, and never in the accent colour.
const handleTag = (h: string): string => `<span class="handle" lang="zh-Hant">${escapeHtml(h)}</span>`;

export const colophonHandle = (c: Colophon): string => handle(c.token, sealName(c));

export function ownSealMark(seal: SealRow | undefined, token: string, key: string): string {
  return seal ? renderStored(seal.char, seal.style, seal.strokes, key) : sealGlyph(token);
}

function isNew(c: Colophon, viewer: Viewer): boolean {
  return viewer.seenUpTo !== undefined && c.id > viewer.seenUpTo && c.token !== viewer.token;
}

// The one place a colophon becomes HTML, for the full page and the live event
// alike, so there is exactly one path from a stranger's words to markup and
// it goes through escapeHtml.
export function renderColophon(c: Colophon, viewer: Viewer): string {
  const mine = c.token === viewer.token;
  const classes = ["colophon", mine ? "colophon--mine" : "", isNew(c, viewer) ? "colophon--new" : ""]
    .filter(Boolean)
    .join(" ");
  return `<li class="${classes}" id="c-${c.id}" data-id="${c.id}">
        <span class="colophon-seal" aria-hidden="true">${sealMark(c, `l${c.id}`)}</span>
        <p class="colophon-body">${escapeHtml(c.body)}</p>
        <p class="colophon-date">${handleTag(colophonHandle(c))} ${dateFmt.format(new Date(c.created_at))}${mine ? " — yours" : ""}</p>
      </li>`;
}

// What a live stream carries for one colophon: the rendered line, never the
// token it was written with.
export function colophonEvent(c: Colophon, viewer: Viewer): { id: number; html: string; seal: string } {
  return { id: c.id, html: renderColophon(c, { token: viewer.token }), seal: renderPaintingSeal(c, viewer) };
}

// The painting ships as three tiles of one 7430×600 image (each under the
// 2560px a committed image may be), laid edge to edge.
const TILES = [2477, 2477, 2476];
const PAINTING_ALT =
  "A handscroll: Wang Yi's portrait of Yang Zhuxi standing beside a pine, with Ni Zan's pine and rocks, a panel naming the painters at the right end, and nine colophons by their contemporaries unrolling to the left, all scattered with collectors' seals.";

// Marked details on the painting, and the note under it. Every fact here is
// from the Palace Museum's own page for the scroll (PALACE_MUSEUM below)
// unless it says otherwise; positions are fractions of the 7430×600 scan.
const PALACE_MUSEUM = "https://www.dpm.org.cn/collection/paint/228452.html";
const HANDSCROLL = "https://en.wikipedia.org/wiki/Handscroll";

const DETAILS = [
  {
    id: "figure",
    x: 0.8385,
    y: 0.47,
    title: "Yang Zhuxi",
    text: "The scholar Yang Qian, called Zhuxi, of Songjiang, born in 1283, who never took office and lived as a recluse. Wang Yi drew him in a black cap with a staff in his right hand, the face in pale ink, almost all line.",
  },
  {
    id: "pine",
    x: 0.7565,
    y: 0.25,
    title: "Ni Zan's pine and rocks",
    text: "Ni Zan added the pine and the rocks around the figure, in dry, pale ink. Wang Yi's portrait came first.",
  },
  {
    id: "inscription",
    x: 0.7165,
    y: 0.3,
    title: "Ni Zan's inscription",
    text: "“Portrait of the recluse Yang Zhuxi, painted by Wang Yi of Yanling; Ni Zan of Gouwu added the pine and rocks. Second month of the guimao year”: 1363.",
  },
  {
    id: "seals",
    x: 0.9035,
    y: 0.55,
    title: "Collectors' seals",
    text: "Ming and Qing owners, among them Xiang Yuanbian and Song Luo, pressed 48 seals and 5 half-seals onto the painting itself.",
  },
  {
    id: "title",
    x: 0.9705,
    y: 0.12,
    title: "The panel before the painting",
    text: "At the right end, where a handscroll starts, a panel names the painters and the writers of the colophons. Among its seals is 子韶過眼, a viewing seal: Zishao looked at this scroll.",
  },
  {
    id: "colophons",
    x: 0.35,
    y: 0.08,
    title: "Nine colophons",
    text: "Unrolling leftwards, nine Yuan writers, among them Zheng Yuanyou and Yang Weizhen, inscribed the paper after the painting, with more than 80 seals.",
  },
];

function renderDetailMarkers(): string {
  return DETAILS.map(
    (d, i) =>
      `<a class="detail-marker" href="#detail-${d.id}" data-detail="${d.id}"
                 style="left: ${(d.x * 100).toFixed(2)}%; top: ${(d.y * 100).toFixed(2)}%"
                 aria-label="Detail ${i + 1}: ${escapeHtml(d.title)}"><span aria-hidden="true">${i + 1}</span></a>`,
  ).join("\n                ");
}

function renderAbout(): string {
  return `<div class="about">
        <h2 id="about-heading">About this painting</h2>
        <p>
          Around 1363 the portrait painter Wang Yi drew the scholar Yang Zhuxi standing with his
          staff, and the landscape painter Ni Zan added a pine and rocks beside him. It is ink on
          paper, 27.7 by 86.8 centimetres, and the only surviving painting by Wang Yi. Like every
          handscroll it is viewed from its right end, unrolled a section at a time, with a
          colophon section after the painting left for inscriptions: here nine writers of the
          time added theirs, and the collectors who owned it over the next centuries added
          their seals. The margin below is the same habit, kept going.
        </p>
        <ol class="details-list">
          ${DETAILS.map((d, i) => `<li id="detail-${d.id}"><span class="details-num" aria-hidden="true">${i + 1}</span> <strong>${escapeHtml(d.title)}.</strong> ${escapeHtml(d.text)}</li>`).join("\n          ")}
        </ol>
        <p class="sources">Sources: the <a href="${PALACE_MUSEUM}">Palace Museum's page for the scroll</a>
          (in Chinese); <a href="${HANDSCROLL}">Wikipedia on the handscroll</a> for how one is
          viewed and laid out.</p>
      </div>`;
}

// A colophon's seal on the painting, where the server placed it. A link down
// to the line itself, so it works with no script; with one, it opens a small
// popover instead. Yours is vermilion, everyone else's ink.
export function renderPaintingSeal(c: Colophon, viewer: Viewer): string {
  if (c.spot_x === null || c.spot_y === null) return "";
  const mine = c.token === viewer.token;
  const date = dateFmt.format(new Date(c.created_at));
  return `<a class="painting-seal${mine ? " painting-seal--mine" : ""}" href="#c-${c.id}" data-id="${c.id}" data-spot="${spotIndex({ x: c.spot_x, y: c.spot_y })}"
                   style="left: ${(c.spot_x * 100).toFixed(2)}%; top: ${(c.spot_y * 100).toFixed(2)}%"
                   aria-label="${mine ? "Your seal" : "A seal"}, ${escapeHtml(colophonHandle(c))}: a colophon written ${date}"><span aria-hidden="true">${sealMark(c, `p${c.id}`)}</span></a>`;
}

function pace(seconds: number): string {
  if (seconds <= 0) return "";
  const minutes = seconds / 60;
  const words = ["", "one", "two", "three", "four", "five"];
  if (Number.isInteger(minutes) && minutes >= 1)
    return minutes === 1 ? "One line a minute." : `One line every ${words[minutes] ?? minutes} minutes.`;
  return `One line every ${seconds} seconds.`;
}

export function lookingText(n: number): string {
  return n <= 1 ? "only you are looking now" : `${n} people looking now`;
}

function colophonList(colophons: Colophon[], viewer: Viewer): string {
  const firstNew = colophons.findIndex((c) => isNew(c, viewer));
  return colophons
    .map((c, i) => {
      const entry = renderColophon(c, viewer);
      return i === firstNew
        ? `<li class="since-rule"><span>since your last visit</span></li>\n          ${entry}`
        : entry;
    })
    .join("\n          ");
}

export interface IndexOptions {
  colophons: Colophon[];
  viewer: Viewer;
  looking: number;
  firstVisit: boolean;
  limits: { intervalSeconds: number; ipDaily: number };
  error?: RejectReason;
  draft?: string;
  form?: URLSearchParams; // the choices a rejected write came back with
  ownSeal?: SealRow;
  ownSealFixed: boolean;
  freeSpots: number[];
}

type Choice = "generated" | "ready" | "carved";

const isReady = (seal: SealRow | undefined): boolean => seal?.strokes === READY_STROKES;
const FIRST_CHAR = Object.keys(GUIDES)[0]!;

// What step 1 starts on: what a rejected write asked for, otherwise the seal
// the visitor already has.
function choices(o: IndexOptions): { choice: Choice; char: string; style: string } {
  const asked = o.form?.get("seal");
  const choice: Choice =
    asked === "generated" || asked === "ready" || asked === "carved"
      ? asked
      : o.ownSeal
        ? isReady(o.ownSeal)
          ? "ready"
          : "carved"
        : "generated";
  const char = o.form?.get("char") ?? o.ownSeal?.char ?? FIRST_CHAR;
  const style = o.form?.get("style") ?? o.ownSeal?.style ?? "zhu";
  return { choice, char: Object.hasOwn(GUIDES, char) ? char : FIRST_CHAR, style: style === "bai" ? "bai" : "zhu" };
}

// The mark step 1 starts with, and the one the previews show.
function chosenMark(o: IndexOptions, key: string): string {
  const { choice, char, style } = choices(o);
  if (o.ownSealFixed || choice === "carved") return ownSealMark(o.ownSeal, o.viewer.token, key);
  if (choice === "ready") return renderStored(char, style, READY_STROKES, key);
  return sealGlyph(o.viewer.token);
}

function chosenHandle(o: IndexOptions): string {
  const { choice, char } = choices(o);
  if (o.ownSealFixed || choice === "carved") return handle(o.viewer.token, o.ownSeal?.char);
  return handle(o.viewer.token, choice === "ready" ? char : undefined);
}

// Step 1. A ready-made seal and a carved one share the character and style
// pickers: ready-made is the character as the font draws it, carved is the
// visitor's own tracing of it. Carving is a pointer gesture, so it needs a
// script; without one its option and pad stay hidden and the other two work.
function renderSealStep(o: IndexOptions): string {
  if (o.ownSealFixed) {
    return `<div class="step step-seal">
          <h3 class="step-title"><span class="step-num" aria-hidden="true">1</span> Your seal</h3>
          <p class="carve-note"><span class="seal-preview" aria-hidden="true">${ownSealMark(o.ownSeal, o.viewer.token, "s")}</span>
            Your seal is on the scroll now, and fixed, like everything else here.</p>
        </div>`;
  }
  const { choice, char, style } = choices(o);
  const chars = Object.entries(GUIDES)
    .map(
      ([ch, g]) =>
        `<label class="carve-choice"><input type="radio" name="char" value="${escapeHtml(ch)}"${ch === char ? " checked" : ""} /><span class="carve-char" lang="zh-Hant">${escapeHtml(ch)}</span><span class="carve-meaning">${escapeHtml(g.meaning)}</span></label>`,
    )
    .join("\n              ");
  const radio = (value: Choice, label: string, extra = ""): string =>
    `<label class="seal-option"${extra}><input type="radio" name="seal" value="${value}"${choice === value ? " checked" : ""} /> ${label}</label>`;
  return `<fieldset class="step step-seal" data-choice="${choice}" data-has-carved="${o.ownSeal !== undefined && !isReady(o.ownSeal)}">
          <legend class="step-title"><span class="step-num" aria-hidden="true">1</span> Choose your seal</legend>
          <div class="seal-options">
            ${radio("generated", `The seal chosen for your browser, <span lang="zh-Hant">${sealGlyph(o.viewer.token)}</span>`)}
            ${radio("ready", "A ready-made seal: a character and a style")}
            ${radio("carved", "Carve your own: trace a character yourself", ' data-needs-script hidden')}
          </div>
          <div class="seal-preview-row">
            <span class="seal-preview" aria-hidden="true">${chosenMark(o, "s")}</span>
            <span class="handle choice-handle" lang="zh-Hant">${escapeHtml(chosenHandle(o))}</span>
          </div>
          <div class="seal-pickers">
            <fieldset class="carve-chars">
              <legend>Character</legend>
              ${chars}
            </fieldset>
            <fieldset class="carve-styles">
              <legend>Style</legend>
              <label><input type="radio" name="style" value="zhu"${style === "zhu" ? " checked" : ""} /> 朱文, strokes standing on paper</label>
              <label><input type="radio" name="style" value="bai"${style === "bai" ? " checked" : ""} /> 白文, strokes cut out of a square</label>
            </fieldset>
          </div>
          <div class="carve-tool" hidden>
            <p>Trace the character's old small-seal form over the faint guide. It doesn't need to
              be skilful, only to follow the guide. Once a line carries it, it can't be changed.</p>
            <div class="carve-pad-wrap">
              <svg class="carve-pad" viewBox="0 0 1000 1000" role="img" aria-label="Tracing pad: draw over the guide's strokes">
                <rect width="1000" height="1000" class="carve-pad-bg" />
                <path class="carve-guide" d="" />
                <g class="carve-ink"></g>
              </svg>
            </div>
            <div class="carve-actions">
              <button type="button" data-carve="save">Keep this seal</button>
              <button type="button" data-carve="restart" class="quiet">Start again</button>
            </div>
            <p class="carve-status" role="status"></p>
          </div>
          <p class="carve-credit">Seal forms: the small-seal (篆書) characters of the
            <a href="https://www.cns11643.gov.tw/">CNS11643 全字庫說文解字</a> font, from Taiwan's
            Ministry of Digital Affairs, under the Open Government Data License, version 1.0.</p>
        </fieldset>`;
}

const spotLabel = (i: number): string => `${SPOT_PLACES[i]}, spot ${i + 1}`;

// Step 2. Without a script it's a list of the free spots; with one, the
// free spots also show on the painting to click, and the list follows. The
// server checks the spot again inside the write.
function renderSpotStep(o: IndexOptions): string {
  if (o.freeSpots.length === 0) {
    return `<div class="step step-spot">
          <h3 class="step-title"><span class="step-num" aria-hidden="true">2</span> Where it goes</h3>
          <p class="step-note">Every spot on the painting is taken, so your seal goes beside your
            line in the list, and the painting stays uncovered.</p>
        </div>`;
  }
  const asked = o.error === "taken" || o.error === "spot" ? undefined : o.form?.get("spot");
  const options = o.freeSpots
    .map((i) => `<option value="${i}"${asked === String(i) ? " selected" : ""}>${escapeHtml(spotLabel(i))}</option>`)
    .join("\n              ");
  return `<div class="step step-spot">
          <h3 class="step-title"><span class="step-num" aria-hidden="true">2</span> Choose where it goes</h3>
          <p class="step-note" id="spot-note">Only blank silk, clear of the figure, the pine, the rocks and
            other seals. <span class="spot-hint" hidden>Click a dotted square on the painting, or pick from the list.</span></p>
          <label for="spot">Spot</label>
          <select id="spot" name="spot" aria-describedby="spot-note">
            <option value="any">The first free spot</option>
              ${options}
          </select>
        </div>`;
}

// Free spots on the painting, to click. Script only: served hidden.
function renderSpotMarkers(o: IndexOptions): string {
  return o.freeSpots
    .map((i) => {
      const s = SPOTS[i]!;
      return `<button type="button" class="spot-marker" data-spot="${i}" aria-pressed="false"
                 style="left: ${(s.x * 100).toFixed(2)}%; top: ${(s.y * 100).toFixed(2)}%"
                 aria-label="Put your seal here: ${escapeHtml(spotLabel(i))}"></button>`;
    })
    .join("\n                ");
}

function renderTabs(): string {
  const tab = (id: string, label: string, selected: boolean): string =>
    `<button type="button" role="tab" id="tab-${id}" aria-controls="${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`;
  return `<div class="tabs" role="tablist" aria-label="About the painting, making your mark, and the colophons" hidden>
          ${tab("about", "About this painting", true)}
          ${tab("mark", "Make your mark", false)}
          ${tab("colophons", "Colophons", false)}
        </div>`;
}

export function renderIndex(o: IndexOptions): string {
  const lastId = o.colophons.at(-1)?.id ?? 0;

  const body = `
    <header class="site-header">
      <h1>Colophon</h1>
      <p class="kicker">a shared margin on one painting</p>
      <p class="guoyan"><span class="guoyan-mark" lang="zh-Hant" aria-hidden="true">過眼</span>
        <span class="guoyan-text" aria-live="polite">${lookingText(o.looking)}</span></p>
      <p><a href="/readme/">what good means here</a></p>
    </header>
    <main class="exhibit">
      <div class="panel panel-painting">
      <figure class="scroll-frame${o.firstVisit ? " unroll" : ""}">
        <div class="scroll-window">
          <div class="scroll-tools" hidden>
            <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
            <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
            <button type="button" data-action="details" aria-pressed="false">Details</button>
            <button type="button" data-action="fullscreen" aria-pressed="false">Full screen</button>
          </div>
          <p class="scroll-hint" hidden>scroll ← to unroll</p>
          <div class="scroll-scroller" tabindex="0" role="region" aria-label="The painting, scrolling sideways">
            <div class="scroll-canvas">
              ${TILES.map(
                (t, i) =>
                  `<img src="/public/scroll-${i}.avif" width="${t}" height="${IMAGE_HEIGHT}" alt="${i === 0 ? PAINTING_ALT : ""}" />`,
              ).join("\n              ")}
              <div class="painting-details">
                ${renderDetailMarkers()}
              </div>
              <div class="painting-seals">
                ${o.colophons.map((c) => renderPaintingSeal(c, o.viewer)).join("\n                ")}
              </div>
              <div class="painting-spots" hidden>
                ${renderSpotMarkers(o)}
                <span class="painting-seal painting-seal--mine spot-preview" aria-hidden="true" hidden><span>${chosenMark(o, "p")}</span></span>
              </div>
            </div>
          </div>
        </div>
        <figcaption>
          Wang Yi, <cite>Portrait of Yang Zhuxi</cite>, 1363 — Ni Zan painted the pine and
          rocks. Ink on paper, Palace Museum, Beijing. The scroll opens at its right end, as a
          handscroll does; scroll left through the colophons nine of their contemporaries wrote
          after it. Scan: Palace Museum, via
          <a href="https://commons.wikimedia.org/wiki/File:%E7%8E%8B%E7%BB%8E%E5%80%AA%E7%93%92%E6%9D%A8%E7%AB%B9%E8%A5%BF%E5%B0%8F%E5%83%8F%E5%8D%B7.png">Wikimedia Commons</a>,
          public domain.
        </figcaption>
      </figure>
      </div>

      <div class="panel panel-side">
        ${renderTabs()}

        <section id="about" class="tab-panel" aria-labelledby="about-heading">
        ${renderAbout()}
        </section>

        <section id="mark" class="tab-panel" aria-labelledby="write-heading">
          <h2 id="write-heading">Make your mark</h2>
          <p class="section-note">Three steps: a seal, a place for it on the painting, and a line in
            the margin. They're saved together, and none of it can be taken back.</p>
          <p class="form-error" role="alert"${o.error ? "" : " hidden"}>${o.error ? escapeHtml(MESSAGES[o.error]) : ""}</p>
          <form method="post" action="/colophons" class="desk"
                data-interval-seconds="${o.limits.intervalSeconds}" data-ip-daily="${o.limits.ipDaily}"
                data-has-written="${o.colophons.some((c) => c.token === o.viewer.token)}">
            ${renderSealStep(o)}
            ${renderSpotStep(o)}
            <div class="step step-write">
              <h3 class="step-title"><span class="step-num" aria-hidden="true">3</span> <label for="body">Write your colophon</label></h3>
              <textarea
                id="body"
                name="body"
                maxlength="${MAX_BODY_LENGTH}"
                rows="4"
                required
                aria-describedby="desk-note"
              >${escapeHtml(o.draft ?? "")}</textarea>
              <p class="desk-count" hidden><span aria-hidden="true" class="desk-count-visible"></span><span class="visually-hidden" aria-live="polite"></span></p>
              <div class="desk-preview" hidden>
                <p class="desk-preview-label">As it will appear</p>
                <div class="colophon colophon--mine">
                  <span class="colophon-seal" aria-hidden="true">${chosenMark(o, "v")}</span>
                  <p class="colophon-body"></p>
                  <p class="colophon-date"><span class="handle choice-handle" lang="zh-Hant">${escapeHtml(chosenHandle(o))}</span></p>
                </div>
              </div>
              <p class="desk-note" id="desk-note">Keep it to ${MAX_BODY_LENGTH} characters. Once it's
                written in, it can't be changed or taken back. ${pace(o.limits.intervalSeconds)}</p>
              <p class="desk-confirm" hidden>This is your first line here. It stays on the scroll for good —
                press again to write it in.</p>
              <button type="submit">Write it in</button>
            </div>
          </form>
        </section>

        <section id="colophons" class="tab-panel" aria-labelledby="colophons-heading">
          <h2 id="colophons-heading">Colophons</h2>
          <p class="section-note">
            Oldest first, the way a scroll unrolls. Yours is marked once it's here — nothing
            you write can be edited or taken back, the same as ink.
          </p>
          <ol class="colophon-list" data-last-id="${lastId}">
            ${colophonList(o.colophons, o.viewer)}
          </ol>
          ${o.colophons.length === 0 ? `<p class="empty-note">No one has written in the margin yet.</p>` : ""}
        </section>
      </div>
    </main>
    <footer>
      <p>Your seal on this page is <strong class="footer-seal">${ownSealMark(o.ownSeal, o.viewer.token, "f")}</strong>
        ${ownHandle(o)} — remembered by your browser, not by a name. <a href="/readme/">Read more.</a></p>
    </footer>
    <script src="/public/colophon.js" defer></script>
  `;

  return layout("Colophon", body, "page-index");
}

// The visitor's own handle, wherever the page shows their seal to them.
function ownHandle(o: IndexOptions): string {
  return `<span class="handle own-handle" lang="zh-Hant">${escapeHtml(handle(o.viewer.token, o.ownSeal?.char))}</span>`;
}

export function renderReadme(html: string): string {
  const body = `
    <header class="site-header">
      <h1><a href="/">Colophon</a></h1>
      <p class="kicker">what good means here</p>
    </header>
    <main class="prose">
      ${html}
    </main>
  `;
  return layout("About — Colophon", body);
}
