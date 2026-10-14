import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { extname } from "node:path";
import { addColophon, clearSeal, currentSeal, freeSpotsNow, listColophons, saveSeal, sealFixed, waitFor, type SealChoice } from "./db.ts";
import { checkSeal, isReadyChoice, MAX_SEAL_BODY_BYTES, renderCarved } from "./carve.ts";
import { SPOTS } from "./spots.ts";
import { handle, sealGlyph } from "./seal.ts";
import { provenance, recentLines, SPEC_KEY } from "./provenance.ts";
import { sealToken, seenCookie, seenUpTo } from "./cookies.ts";
import { clientIp, countWrite, ipHasRoom, IP_DAILY_LIMIT, WRITE_INTERVAL_MS } from "./limits.ts";
import { broadcast, lookingWith, openStream } from "./live.ts";
import { colophonEvent, renderIndex, renderReadme, MAX_BODY_LENGTH, MESSAGES, type RejectReason } from "./render.ts";
import { renderMarkdown } from "./markdown.ts";

const PORT = Number(process.env.PORT ?? 8080);
const README = readFileSync("README.md", "utf8");

const MIME: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

// A URL-encoded 320-character colophon body never comes close to this — it's
// a hard ceiling against a request that skips the form's own maxlength, not a
// tuned limit. Checked as bytes arrive, not after the fact: buffering an
// unbounded body into memory first (whatever a crafted Content-Length or a
// chunked request without one claims) is itself the vulnerability on a
// single-machine deploy with a tight memory ceiling.
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

// Once the cap is crossed, later chunks are read and discarded rather than
// accumulated — costs no memory, since each one is immediately eligible for
// GC — but the stream is still let run to its natural end before responding.
// Destroying the connection early, tried first, raced a still-writing client
// into a raw connection error instead of a clean 413: a declared
// Content-Length is a promise the client already committed to keeping, and
// only reading it out fully guarantees the client's own write has finished
// before it goes to read our response. A stalled or genuinely enormous body
// is bounded by Node's own default request timeout, not by this function.
async function readBody(
  req: import("node:http").IncomingMessage,
  max = MAX_REQUEST_BODY_BYTES,
): Promise<string | undefined> {
  const declared = Number(req.headers["content-length"]);
  let tooLarge = Number.isFinite(declared) && declared > max;

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > max) tooLarge = true;
    if (!tooLarge) chunks.push(buf);
  }
  return tooLarge ? undefined : Buffer.concat(chunks).toString("utf8");
}

// The page, for a GET or for a rejected POST without a script: a rejection
// comes back as the page itself, with the message and the visitor's own text
// still in the textarea, rather than a redirect that would lose it.
function sendIndex(
  req: IncomingMessage,
  res: ServerResponse,
  cookies: string[],
  token: string,
  status: number,
  extra: { firstVisit?: boolean; error?: RejectReason; draft?: string; form?: URLSearchParams } = {},
): void {
  const colophons = listColophons();
  const lastId = colophons.at(-1)?.id ?? 0;
  const ownSeal = currentSeal(token);
  const html = renderIndex({
    ownSeal,
    ownSealFixed: ownSeal !== undefined && sealFixed(ownSeal),
    colophons,
    viewer: { token, seenUpTo: seenUpTo(req.headers.cookie) },
    looking: lookingWith(token),
    firstVisit: extra.firstVisit ?? false,
    limits: { intervalSeconds: WRITE_INTERVAL_MS / 1000, ipDaily: IP_DAILY_LIMIT },
    error: extra.error,
    draft: extra.draft,
    form: extra.form,
    freeSpots: freeSpotsNow(),
  });
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Set-Cookie": [...cookies, seenCookie(lastId)],
  });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

const SEAL_MESSAGES = {
  invalid: "That seal couldn't be read. Start again and trace the guide.",
  untraced: "Trace the character's strokes; your seal needs to follow the guide.",
  fixed: "Your seal is already on the scroll, so it can't be changed.",
};

const REJECT_STATUS: Record<RejectReason, number> = {
  empty: 400,
  long: 400,
  wet: 429,
  taken: 409,
  spot: 400,
  seal: 400,
  fixed: 409,
  uncarved: 409,
};

// Step 2: a spot is an index into SPOTS, or absent for "the first free one".
function parseSpot(raw: string | null): number | undefined | "bad" {
  if (raw === null || raw === "" || raw === "any") return undefined;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) >= SPOTS.length) return "bad";
  return Number(raw);
}

// Step 1: which seal the line carries. No field at all keeps whatever the
// visitor has now, which is how a page from before the steps still posts.
function parseSeal(form: URLSearchParams): SealChoice | "bad" {
  const seal = form.get("seal");
  if (seal === null || seal === "keep") return "keep";
  if (seal === "generated" || seal === "carved") return seal;
  if (seal === "ready") {
    const char = form.get("char");
    const style = form.get("style");
    return isReadyChoice(char, style) ? { char: char!, style } : "bad";
  }
  return "bad";
}

// How a visitor appears on the page and in the log: their carved seal's
// character if they have one, otherwise their generated glyph, with the tag.
const whoIs = (token: string): string => handle(token, currentSeal(token)?.char);

// A visitor arriving with no seal is given one, only on the routes that set
// the cookie (a stylesheet fetch doesn't), and that's logged once, there.
function issue(token: string, setCookie: string | undefined, replaced: boolean | undefined, route: string): void {
  if (!setCookie) return;
  provenance("seal-issued", replaced ? "replaced-invalid-cookie" : "new", whoIs(token), { route });
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    // One boundary for the whole handler: a client hanging up mid-body makes
    // the body read reject, and an unhandled rejection exits the process for
    // everyone else on the scroll.
    provenance("request", "error", "-", { route: new URL(req.url ?? "/", "http://internal").pathname, error: (err as Error).message });
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end();
  }
});

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://internal");
  const { token, setCookie, replaced } = sealToken(req.headers.cookie);
  const cookies = setCookie ? [setCookie] : [];

  if (req.method === "GET" && url.pathname === "/") {
    issue(token, setCookie, replaced, "/");
    sendIndex(req, res, cookies, token, 200, { firstVisit: setCookie !== undefined });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    issue(token, setCookie, replaced, "/events");
    openStream(req, res, url, token, listColophons().at(-1)?.id ?? 0, whoIs(token));
    return;
  }

  if (req.method === "POST" && url.pathname === "/colophons") {
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    issue(token, setCookie, replaced, "/colophons");
    const raw = await readBody(req);
    if (raw === undefined) {
      provenance("write", "refused", whoIs(token), { reason: "too-large" });
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("payload too large");
      return;
    }
    const wantsJson = (req.headers.accept ?? "").includes("application/json");
    const form = new URLSearchParams(raw);
    const draft = form.get("body") ?? "";
    const body = draft.trim();
    const spot = parseSpot(form.get("spot"));
    const seal = parseSeal(form);
    const ip = clientIp(req);

    let error: RejectReason | undefined;
    let reason: string | undefined;
    if (body.length === 0) error = reason = "empty";
    else if (body.length > MAX_BODY_LENGTH) error = reason = "long";
    else if (waitFor(token, WRITE_INTERVAL_MS) > 0) (error = "wet"), (reason = "wet-ink");
    else if (!ipHasRoom(ip)) (error = "wet"), (reason = "address-daily-limit");
    else if (spot === "bad") error = reason = "spot";
    else if (seal === "bad") error = reason = "seal";

    const refuse = (error: RejectReason, fields: Record<string, string | number | undefined>): void => {
      provenance("write", "refused", whoIs(token), { reason: error === "wet" ? reason : error, length: body.length, ...fields });
      if (wantsJson) sendJson(res, REJECT_STATUS[error], { error, message: MESSAGES[error], freeSpots: freeSpotsNow() });
      else sendIndex(req, res, cookies, token, REJECT_STATUS[error], { error, draft, form });
    };

    if (error || spot === "bad" || seal === "bad") {
      refuse(error!, {});
      return;
    }

    // Broadcast only once the insert has committed, with the row it returned.
    const before = whoIs(token);
    const result = addColophon(token, body, { spot, seal });
    if (!result.ok) {
      refuse(result.reason, { spot });
      return;
    }
    const row = result.row;
    countWrite(ip);
    broadcast(row);
    const kind = row.seal_id === null ? "generated" : row.seal_strokes === "[]" ? "ready" : "carved";
    provenance("write", "ok", whoIs(token), {
      colophon: row.id,
      length: body.length,
      seal: kind,
      was: before === whoIs(token) ? undefined : before,
    });
    provenance("place", "ok", whoIs(token), {
      colophon: row.id,
      spot: result.spot === -1 ? "none" : result.spot,
      how: result.spot === -1 ? "no-free-spot" : result.chosen ? "chosen" : "first-free",
    });

    if (wantsJson) sendJson(res, 201, colophonEvent(row, { token }));
    else {
      res.writeHead(303, { Location: `/#c-${row.id}` });
      res.end();
    }
    return;
  }

  // A carved seal, posted as JSON by the carving script. It has its own body
  // cap, sized from the seal limits in src/carve.ts; every other route keeps
  // the 16 KB one.
  if (req.method === "POST" && url.pathname === "/seal") {
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    issue(token, setCookie, replaced, "/seal");
    const raw = await readBody(req, MAX_SEAL_BODY_BYTES);
    if (raw === undefined) {
      provenance("seal", "refused", whoIs(token), { reason: "too-large" });
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("payload too large");
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      provenance("seal", "refused", whoIs(token), { reason: "invalid" });
      sendJson(res, 400, { error: "invalid", message: SEAL_MESSAGES.invalid });
      return;
    }

    if (JSON.stringify(input) === '{"clear":true}') {
      const before = whoIs(token);
      const done = clearSeal(token);
      if (done === "fixed") {
        provenance("seal-clear", "refused", before, { reason: "fixed" });
        sendJson(res, 409, { error: "fixed", message: SEAL_MESSAGES.fixed });
      } else {
        provenance("seal-clear", "ok", before, { now: whoIs(token) });
        sendJson(res, 200, { mark: sealGlyph(token), handle: whoIs(token) });
      }
      return;
    }

    const verdict = checkSeal(input);
    if (!verdict.ok) {
      provenance("seal", "refused", whoIs(token), { reason: verdict.reason });
      sendJson(res, 400, { error: verdict.reason, message: SEAL_MESSAGES[verdict.reason] });
      return;
    }
    const { char, style, strokes } = verdict.seal;
    const before = whoIs(token);
    const saved = saveSeal(token, char, style, JSON.stringify(strokes));
    if (saved === "fixed") {
      provenance("seal", "refused", before, { reason: "fixed" });
      sendJson(res, 409, { error: "fixed", message: SEAL_MESSAGES.fixed });
      return;
    }
    provenance("seal", "carved", before, { now: whoIs(token), style });
    sendJson(res, 201, { mark: renderCarved(verdict.seal, "v"), handle: whoIs(token) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/_provenance" && SPEC_KEY && req.headers["x-provenance-key"] === SPEC_KEY) {
    const after = Number(url.searchParams.get("after") ?? 0);
    const { total, lines } = recentLines(Number.isSafeInteger(after) && after > 0 ? after : 0);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "X-Provenance-Total": String(total) });
    res.end(lines.join("\n"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/readme/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderReadme(renderMarkdown(README)));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/public/")) {
    const ext = extname(url.pathname);
    const type = MIME[ext];
    if (!type) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    readFile(`.${url.pathname}`, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`colophon listening on 0.0.0.0:${PORT}`);
});
