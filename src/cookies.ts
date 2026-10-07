import { randomUUID } from "node:crypto";

const SEAL_COOKIE = "seal";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

// Every token this server ever issues is a randomUUID(). A cookie claiming to
// be "existing" is trusted verbatim and then written into the append-only
// colophons table on every single insert from that visitor — so a well-formed
// but arbitrary value (no decodeURIComponent error, just not a UUID) has to be
// rejected on shape too, not only on decode failure. Without this, a crafted
// Cookie header near Node's own ~16KB header-size ceiling persists that many
// bytes, forever, on every colophon that visitor ever writes — unlike the
// colophon body, which is capped at 320 characters at the same boundary.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A client can send any bytes it likes as a Cookie header, including a
// percent-encoding decodeURIComponent rejects outright (a bare "%", say).
// That's someone else's malformed cookie, not a reason to fail the request:
// treat it the same as no cookie at all, rather than let it throw synchronously
// inside the request handler and take the whole single-machine process down.
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// Every visitor is identified by one anonymous, unguessable token, set the
// first time they arrive with no account and no name attached — the same
// answer to "who counts as a person" a seal gives: presence without identity.
export function sealToken(cookieHeader: string | undefined): { token: string; setCookie?: string } {
  const existing = parseCookie(cookieHeader, SEAL_COOKIE);
  if (existing && UUID_RE.test(existing)) return { token: existing };

  const token = randomUUID();
  return { token, setCookie: `${SEAL_COOKIE}=${token}; Max-Age=${TEN_YEARS_SECONDS}; Path=/; HttpOnly; SameSite=Lax` };
}

const SEEN_COOKIE = "seen";

// The highest colophon id this browser was last shown, so a return visit can
// mark what's been written since. Not HttpOnly: the page's script moves it
// forward as lines arrive live, since those were seen too. Anything that
// isn't a plain id reads as a first visit.
export function seenUpTo(cookieHeader: string | undefined): number | undefined {
  const raw = parseCookie(cookieHeader, SEEN_COOKIE);
  return raw !== undefined && /^\d{1,15}$/.test(raw) ? Number(raw) : undefined;
}

export function seenCookie(id: number): string {
  return `${SEEN_COOKIE}=${id}; Max-Age=${TEN_YEARS_SECONDS}; Path=/; SameSite=Lax`;
}
