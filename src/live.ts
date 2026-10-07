import type { IncomingMessage, ServerResponse } from "node:http";
import { colophonsAfter, type Colophon } from "./db.ts";
import { colophonEvent } from "./render.ts";

// Server-sent events, fanned out from memory. That is correct only because
// there is exactly one process on one machine (fly.toml): every write and
// every open stream meet in this module. A second machine would need the
// fan-out to move somewhere both can see (the database, or a broker), and
// PROCESS.md says so.
const MAX_STREAMS = Number(process.env.MAX_STREAMS ?? 200);
const HEARTBEAT_MS = 15_000; // Fly's proxy drops a stream idle for much longer
const PRESENCE_EVERY_MS = 2_000; // arrivals and departures settle before the count moves

interface Stream {
  res: ServerResponse;
  token: string;
  lastId: number; // highest colophon id this stream has been sent
}

const streams = new Set<Stream>();

function send(stream: Stream, c: Colophon): void {
  if (c.id <= stream.lastId) return;
  stream.lastId = c.id;
  stream.res.write(`id: ${c.id}\nevent: colophon\ndata: ${JSON.stringify(colophonEvent(c, stream))}\n\n`);
}

// 過眼: distinct seals with a stream open, so three tabs in one browser count
// once. The number is all that ever leaves this module about who is here.
export function looking(): number {
  return new Set([...streams].map((s) => s.token)).size;
}

let lastSentCount = -1;
let lastSentAt = 0;
let presenceTimer: NodeJS.Timeout | undefined;

function presenceChanged(): void {
  if (presenceTimer) return;
  presenceTimer = setTimeout(
    () => {
      presenceTimer = undefined;
      const n = looking();
      if (n === lastSentCount) return;
      lastSentCount = n;
      lastSentAt = Date.now();
      // No id: line, so a presence event never moves a client's Last-Event-ID.
      for (const s of streams) s.res.write(`event: presence\ndata: ${n}\n\n`);
    },
    Math.max(0, lastSentAt + PRESENCE_EVERY_MS - Date.now()),
  );
}

export function broadcast(c: Colophon): void {
  for (const s of streams) send(s, c);
}

// Where a (re)connecting stream starts: Last-Event-ID (sent by the browser on
// an automatic reconnect) wins over ?after= (sent by the page on its first
// connect, from the highest id it rendered). With neither, live lines only.
function startingId(req: IncomingMessage, url: URL, latest: number): number {
  for (const raw of [req.headers["last-event-id"], url.searchParams.get("after")]) {
    if (typeof raw === "string" && /^\d{1,15}$/.test(raw)) return Number(raw);
  }
  return latest;
}

export function openStream(req: IncomingMessage, res: ServerResponse, url: URL, token: string, latest: number): void {
  if (streams.size >= MAX_STREAMS) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" });
    res.end("too many open scrolls; try again shortly");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  // Registered and replayed in the same synchronous turn, so no write can land
  // between the replay query and the stream starting to receive broadcasts;
  // send() skips any id at or below what this stream already has.
  const stream: Stream = { res, token, lastId: startingId(req, url, latest) };
  streams.add(stream);
  for (const c of colophonsAfter(stream.lastId)) send(stream, c);
  res.write(`event: presence\ndata: ${looking()}\n\n`);
  presenceChanged();

  req.on("close", () => {
    streams.delete(stream);
    presenceChanged();
  });
}

// A heartbeat keeps the proxy from dropping a quiet stream, and a write to a
// connection that died silently is what finally makes its socket close.
setInterval(() => {
  for (const s of streams) s.res.write(": heartbeat\n\n");
}, HEARTBEAT_MS).unref();

// The count a page shows when it's served: everyone with a stream open, plus
// the visitor asking, who is about to be looking too.
export function lookingWith(token: string): number {
  return looking() + ([...streams].some((s) => s.token === token) ? 0 : 1);
}
