import { inject } from "vitest";

// A small server-sent-events client over fetch, for specs that need to watch
// /events the way a browser's EventSource would: it parses events, comments
// and retry: lines as they stream in, and can wait for the next match.
const baseUrl = inject("baseUrl");

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  at: number; // performance.now() when it arrived
}

export interface Stream {
  status: number;
  contentType: string | null;
  events: SseEvent[];
  comments: string[];
  retry?: number;
  raw: string;
  next(match: (e: SseEvent) => boolean, timeoutMs?: number): Promise<SseEvent>;
  waitFor(check: () => boolean, timeoutMs?: number): Promise<void>;
  close(): void;
}

export async function openStream(
  path = "/events",
  opts: { cookie?: string; lastEventId?: string } = {},
): Promise<Stream> {
  const abort = new AbortController();
  const res = await fetch(new URL(path, baseUrl), {
    signal: abort.signal,
    headers: {
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.lastEventId ? { "Last-Event-ID": opts.lastEventId } : {}),
    },
  });

  const listeners = new Set<() => void>();
  const stream: Stream = {
    status: res.status,
    contentType: res.headers.get("content-type"),
    events: [],
    comments: [],
    raw: "",
    async next(match, timeoutMs = 5000) {
      let seen = 0;
      let found: SseEvent | undefined;
      await stream.waitFor(() => {
        for (; seen < stream.events.length; seen++) {
          if (match(stream.events[seen]!)) {
            found = stream.events[seen];
            return true;
          }
        }
        return false;
      }, timeoutMs);
      return found!;
    },
    waitFor(check, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        if (check()) return resolve();
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`timed out after ${timeoutMs}ms waiting on the stream`));
        }, timeoutMs);
        const listener = (): void => {
          if (!check()) return;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve();
        };
        listeners.add(listener);
      });
    },
    close() {
      abort.abort();
    },
  };

  if (res.status !== 200 || !res.body) {
    await res.body?.cancel();
    return stream;
  }

  (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of res.body!) {
        const text = decoder.decode(chunk, { stream: true });
        stream.raw += text;
        buffer += text;
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event: SseEvent = { event: "message", data: "", at: performance.now() };
          const data: string[] = [];
          let isEvent = false;
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) stream.comments.push(line.slice(1).trim());
            else if (line.startsWith("retry:")) stream.retry = Number(line.slice(6));
            else if (line.startsWith("event:")) ((event.event = line.slice(6).trim()), (isEvent = true));
            else if (line.startsWith("data:")) (data.push(line.slice(5).trimStart()), (isEvent = true));
            else if (line.startsWith("id:")) event.id = line.slice(3).trim();
          }
          if (isEvent) {
            event.data = data.join("\n");
            stream.events.push(event);
          }
        }
        for (const l of [...listeners]) l();
      }
    } catch {
      // aborted by close()
    }
  })();

  return stream;
}

// A fresh visitor's seal cookie, from the page itself.
export async function newVisitor(): Promise<string> {
  const res = await fetch(new URL("/", baseUrl));
  await res.text();
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("seal="));
  if (!cookie) throw new Error("expected a seal cookie");
  return cookie;
}

// Each spec write claims its own client address, so this file's writes don't
// spend the shared per-IP daily allowance the other specs post under. On Fly
// the proxy sets this header itself; see src/limits.ts.
export function fakeIp(): string {
  const octet = (): number => Math.floor(Math.random() * 256);
  return `198.18.${octet()}.${octet()}`;
}

export async function write(
  body: string,
  opts: { cookie?: string; json?: boolean; ip?: string } = {},
): Promise<Response> {
  return fetch(new URL("/colophons", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Fly-Client-IP": opts.ip ?? fakeIp(),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.json ? { Accept: "application/json" } : {}),
    },
    body: new URLSearchParams({ body }).toString(),
  });
}

export const marker = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}x`;

export function parse(e: SseEvent): { id: number; html: string; seal?: string } {
  return JSON.parse(e.data);
}
