import { escapeHtml } from "./html.ts";
import { sealGlyph } from "./seal.ts";
import type { Colophon } from "./db.ts";

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
export function colophonEvent(c: Colophon, viewer: Viewer): { id: number; html: string } {
  return { id: c.id, html: renderColophon(c, { token: viewer.token }) };
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
          <div class="scroll-scroller" tabindex="0" role="img"
               aria-label="A handscroll painting: Wang Yi's 1363 portrait of Yang Zhuxi standing under a pine, with Ni Zan's rocks and pine, flanked by six and a half centuries of collectors' colophons and seals.">
            <img src="/public/scroll.avif" alt="" />
          </div>
        </div>
        <figcaption>
          Wang Yi, <cite>Portrait of Yang Zhuxi</cite>, 1363 — Ni Zan painted the pine and
          rock. Palace Museum, Beijing. Scroll sideways to see the whole thing, including
          six and a half centuries of colophons already written into its margins.
        </figcaption>
      </figure>

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
              data-interval-seconds="${o.limits.intervalSeconds}" data-ip-daily="${o.limits.ipDaily}">
          <label for="body">A line for the margin</label>
          <textarea
            id="body"
            name="body"
            maxlength="${MAX_BODY_LENGTH}"
            rows="3"
            required
          >${escapeHtml(o.draft ?? "")}</textarea>
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
