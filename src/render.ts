import { escapeHtml } from "./html.ts";
import { sealGlyph } from "./seal.ts";
import type { Colophon } from "./db.ts";
import { IMAGE_HEIGHT } from "./spots.ts";

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Australia/Canberra",
});

export const MAX_BODY_LENGTH = 320;

export type RejectReason = "empty" | "long" | "wet";

export const MESSAGES: Record<RejectReason, string> = {
  empty: "A colophon needs at least a few words.",
  long: `Keep it to ${MAX_BODY_LENGTH} characters — the margin is not infinite.`,
  wet: "The ink is still wet on your last line. Give it a few minutes.",
};

// Who is reading a page or a stream: their own seal token (never sent back
// out, only compared) and, on a return visit, the highest colophon id they
// were shown last time.
export interface Viewer {
  token: string;
  seenUpTo?: number;
}

function layout(title: string, body: string): string {
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
  <body>
    ${body}
  </body>
</html>
`;
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
        <span class="colophon-seal" aria-hidden="true">${sealGlyph(c.token)}</span>
        <p class="colophon-body">${escapeHtml(c.body)}</p>
        <p class="colophon-date">${dateFmt.format(new Date(c.created_at))}${mine ? " — yours" : ""}</p>
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
  return `<section class="about" aria-labelledby="about-heading">
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
      </section>`;
}

// A colophon's seal on the painting, where the server placed it. A link down
// to the line itself, so it works with no script; with one, it opens a small
// popover instead. Yours is vermilion, everyone else's ink.
export function renderPaintingSeal(c: Colophon, viewer: Viewer): string {
  if (c.spot_x === null || c.spot_y === null) return "";
  const mine = c.token === viewer.token;
  const date = dateFmt.format(new Date(c.created_at));
  return `<a class="painting-seal${mine ? " painting-seal--mine" : ""}" href="#c-${c.id}" data-id="${c.id}"
                   style="left: ${(c.spot_x * 100).toFixed(2)}%; top: ${(c.spot_y * 100).toFixed(2)}%"
                   aria-label="${mine ? "Your seal" : "A seal"}, ${sealGlyph(c.token)}: a colophon written ${date}"><span aria-hidden="true">${sealGlyph(c.token)}</span></a>`;
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
    <main>
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

      ${renderAbout()}

      <section aria-labelledby="colophons-heading">
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

      <section aria-labelledby="write-heading">
        <h2 id="write-heading">Add yours</h2>
        <p class="form-error" role="alert"${o.error ? "" : " hidden"}>${o.error ? escapeHtml(MESSAGES[o.error]) : ""}</p>
        <form method="post" action="/colophons" class="desk"
              data-interval-seconds="${o.limits.intervalSeconds}" data-ip-daily="${o.limits.ipDaily}"
              data-has-written="${o.colophons.some((c) => c.token === o.viewer.token)}">
          <label for="body">A line for the margin</label>
          <textarea
            id="body"
            name="body"
            maxlength="${MAX_BODY_LENGTH}"
            rows="3"
            required
            aria-describedby="desk-note"
          >${escapeHtml(o.draft ?? "")}</textarea>
          <p class="desk-count" hidden><span aria-hidden="true" class="desk-count-visible"></span><span class="visually-hidden" aria-live="polite"></span></p>
          <div class="desk-preview" hidden>
            <p class="desk-preview-label">As it will appear</p>
            <div class="colophon colophon--mine">
              <span class="colophon-seal" aria-hidden="true">${sealGlyph(o.viewer.token)}</span>
              <p class="colophon-body"></p>
            </div>
          </div>
          <p class="desk-note" id="desk-note">Once it's written in, it can't be changed or taken back.
            ${pace(o.limits.intervalSeconds)}</p>
          <p class="desk-confirm" hidden>This is your first line here. It stays on the scroll for good —
            press again to write it in.</p>
          <button type="submit">Write it in</button>
        </form>
      </section>
    </main>
    <footer>
      <p>Your seal on this page is <strong>${sealGlyph(o.viewer.token)}</strong> — remembered by
        your browser, not by a name. <a href="/readme/">Read more.</a></p>
    </footer>
    <script src="/public/colophon.js" defer></script>
  `;

  return layout("Colophon", body);
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
