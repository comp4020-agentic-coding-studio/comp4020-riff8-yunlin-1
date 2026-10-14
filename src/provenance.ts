// The scroll's provenance: one stdout line per thing a visitor does, so
// `flyctl logs` alone says who did what. A visitor appears as their public
// handle (src/seal.ts), the same one the page shows beside their seal; never
// their token, never an IP address, never what they wrote (the line is
// public on the page already, and its id finds it). Views aren't logged
// either, only actions and open streams: the log mustn't become the record
// of who was looking that 過眼 refuses to keep.
export type Fields = Record<string, string | number | undefined>;

const SAFE = /^[^\s"=]+$/;

function value(v: string | number): string {
  const s = String(v);
  return SAFE.test(s) ? s : JSON.stringify(s);
}

export function format(action: string, outcome: string, who: string, fields: Fields = {}, at = new Date()): string {
  const pairs: [string, string | number | undefined][] = [
    ["at", at.toISOString()],
    ["action", action],
    ["outcome", outcome],
    ["who", who],
    ...Object.entries(fields),
  ];
  return ["provenance", ...pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${value(v!)}`)].join(" ");
}

export function provenance(action: string, outcome: string, who: string, fields: Fields = {}): void {
  const line = format(action, outcome, who, fields);
  console.log(line);
  if (SPEC_KEY) {
    recent.push(line);
    if (recent.length > KEEP) recent.splice(0, recent.length - KEEP);
  }
}

// The spec has to read the log back, and the app it checks runs in its own
// container. With PROVENANCE_SPEC_KEY set (CI sets it; production never
// does), the last lines are kept in memory and served at /_provenance to a
// request carrying that key. Without it, nothing is kept and the route is a
// plain 404, so there is no public view of who did what beyond the page.
export const SPEC_KEY = process.env.PROVENANCE_SPEC_KEY || undefined;
const KEEP = 2000;
const recent: string[] = [];

export function recentLines(): string[] {
  return recent;
}
