import type { IncomingMessage } from "node:http";

// How fast the scroll can be written to. Live delivery makes a flood worse
// (every open screen fills in real time, and nothing can ever be deleted), so
// writing is limited at the boundary like the length check. Configurable only
// so the spec's own load tests can run from one machine; see checks.yml.
export const WRITE_INTERVAL_MS = Number(process.env.WRITE_INTERVAL_SECONDS ?? 120) * 1000;
export const IP_DAILY_LIMIT = Number(process.env.IP_DAILY_LIMIT ?? 30);

const DAY_MS = 24 * 60 * 60 * 1000;

// On Fly the proxy sets Fly-Client-IP on every request; locally there's no
// proxy, so the socket is the client.
export function clientIp(req: IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  return (typeof fly === "string" && fly) || req.socket.remoteAddress || "unknown";
}

// Counted in memory only and never written to the database: a visitor stays
// anonymous, and a restart forgetting the counts costs at most one extra day's
// quota. Each IP keeps the start of its own 24-hour window.
const windows = new Map<string, { start: number; count: number }>();

function current(ip: string, now: number): { start: number; count: number } {
  const w = windows.get(ip);
  if (w && now - w.start < DAY_MS) return w;
  const fresh = { start: now, count: 0 };
  windows.set(ip, fresh);
  return fresh;
}

export function ipHasRoom(ip: string, now = Date.now()): boolean {
  return current(ip, now).count < IP_DAILY_LIMIT;
}

export function countWrite(ip: string, now = Date.now()): void {
  current(ip, now).count++;
}

// Expired windows are dropped hourly so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, w] of windows) if (now - w.start >= DAY_MS) windows.delete(ip);
}, 60 * 60 * 1000).unref();
