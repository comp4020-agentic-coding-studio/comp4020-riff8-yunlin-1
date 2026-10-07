import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { extname } from "node:path";
import { addColophon, listColophons, waitFor } from "./db.ts";
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
async function readBody(req: import("node:http").IncomingMessage): Promise<string | undefined> {
  const declared = Number(req.headers["content-length"]);
  let tooLarge = Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES;

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_REQUEST_BODY_BYTES) tooLarge = true;
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
  extra: { firstVisit?: boolean; error?: RejectReason; draft?: string } = {},
): void {
  const colophons = listColophons();
  const lastId = colophons.at(-1)?.id ?? 0;
  const html = renderIndex({
    colophons,
    viewer: { token, seenUpTo: seenUpTo(req.headers.cookie) },
    looking: lookingWith(token),
    firstVisit: extra.firstVisit ?? false,
    limits: { intervalSeconds: WRITE_INTERVAL_MS / 1000, ipDaily: IP_DAILY_LIMIT },
    error: extra.error,
    draft: extra.draft,
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

const REJECT_STATUS: Record<RejectReason, number> = { empty: 400, long: 400, wet: 429 };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://internal");
  const { token, setCookie } = sealToken(req.headers.cookie);
  const cookies = setCookie ? [setCookie] : [];

  if (req.method === "GET" && url.pathname === "/") {
    sendIndex(req, res, cookies, token, 200, { firstVisit: setCookie !== undefined });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    openStream(req, res, url, token, listColophons().at(-1)?.id ?? 0);
    return;
  }

  if (req.method === "POST" && url.pathname === "/colophons") {
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    const raw = await readBody(req);
    if (raw === undefined) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("payload too large");
      return;
    }
    const wantsJson = (req.headers.accept ?? "").includes("application/json");
    const draft = new URLSearchParams(raw).get("body") ?? "";
    const body = draft.trim();
    const ip = clientIp(req);

    let error: RejectReason | undefined;
    if (body.length === 0) error = "empty";
    else if (body.length > MAX_BODY_LENGTH) error = "long";
    else if (waitFor(token, WRITE_INTERVAL_MS) > 0 || !ipHasRoom(ip)) error = "wet";

    if (error) {
      if (wantsJson) sendJson(res, REJECT_STATUS[error], { error, message: MESSAGES[error] });
      else sendIndex(req, res, cookies, token, REJECT_STATUS[error], { error, draft });
      return;
    }

    // Broadcast only once the insert has committed, with the row it returned.
    const row = addColophon(token, body);
    countWrite(ip);
    broadcast(row);

    if (wantsJson) sendJson(res, 201, colophonEvent(row, { token }));
    else {
      res.writeHead(303, { Location: `/#c-${row.id}` });
      res.end();
    }
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
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`colophon listening on 0.0.0.0:${PORT}`);
});
