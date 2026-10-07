# Process overview

## From the brief to the object

The final project brief fixes three requirements — multi-user, real-time,
persistent — and leaves everything else, including what "good" means, open.
Rather than start from a stack and look for a use for it, I started from a
lens this agent has carried since its very first crit — Ni Zan, ink-wash
restraint, "taste is what you leave out" — and asked what a genuinely
multi-user, real-time, persistent object already looks like in that world.
Chinese handscroll
colophons answered directly: collectors have been appending inscriptions to
the same scroll for centuries, an actual distributed, asynchronous,
permanent multi-author object, long before the word "multi-user" existed.
Building a small digital version of that — one painting, a line each, no
account, no edits — gave the brief's three fixed requirements a concrete,
historically grounded shape instead of the median chat room with the nouns
swapped, which the brief explicitly warns against. `README.md`
([`8d76d80`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/8d76d80)) argues
this in full, against three read sources.

## Building the smallest version of it

[`334d24f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/334d24f) is the
whole first slice: `node:http` for the server and `node:sqlite` for storage,
both Node stdlib, no framework and no bundler. I checked Node 24.21 (the
version this repo pins) directly before committing to this — it runs `.ts`
files unmodified with no build step, and `node:sqlite` needs no native
module compiled in Docker, which is what let the Dockerfile stay a single
`pnpm install --prod` with no build stage. The core write path (posting a
colophon) is a plain HTML form to a POST route that redirects afterward, so
it works with JavaScript off; the real-time layer the brief expects belongs
to next week and would be additive on top of this, not a rewrite of it.

An anonymous per-browser cookie is the only notion of a visitor — no
accounts, matching what `README.md` argues "who counts as a person" should
mean here. The one accent colour (`--seal`) marks exactly one thing: a
colophon the current browser wrote. That's also how this slice answers the
crit's own bar directly — a stranger writes a line, leaves, and the next
time they load the page (even a different day, even after a redeploy, since
the database lives on the Fly volume at `/data`), their own line is still
there, still marked as theirs.

## Corrections that landed in the harness, not just a retry

Two things got caught and fixed by checking rather than assuming:

- The own-seal spec test
  ([`807906b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/807906b))
  first asserted "yours" appeared somewhere in a 400-character slice after
  the marker text — passed for the wrong reason once, then failed for the
  right reason, since "Add yours" (the compose heading) falls inside that
  window too. Fixed by slicing out exactly the `<li>` the marker landed in.
- `CLAUDE.md` ([`33ef6c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/33ef6c8))
  states "escape all stored text before templating" as a standing rule, not
  just a thing I happened to do once: every colophon body is a stranger's
  own words, persisted forever and re-rendered to every future visitor —
  the one place here where getting it wrong is a stored XSS hole, not a
  cosmetic bug.

A second-run deepen pass found two more, both grounded in this repo's own
harness rules rather than a generic bug hunt:

- `CLAUDE.md` says `--seal` marks exactly one thing, "this colophon is
  yours" — but `styles.css` also spent it on the kicker line, the form-error
  banner and the readme's blockquote border
  ([`6a3ecdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/6a3ecdf)).
  Moved all three to `--ink`/`--ink-soft` and added a test that greps every
  `var(--seal)` use, rather than trusting the rule's own wording — a prior
  crit's identical drift went unnoticed for several runs.
- `readBody` buffered an incoming POST with no size cap
  ([`abd5dc4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/abd5dc4)):
  a request skipping the form's own `maxlength="320"` could exhaust memory
  on this single-machine deploy. Confirmed with raw sockets, both a
  declared `Content-Length` over budget and a chunked request declaring
  none. Two fix attempts — destroy the connection, then resume-and-respond
  — both raced a still-writing client into a connection error, caught by
  `pnpm check` flaking against the built image across repeated runs.
  Draining the body to its natural end while discarding past the cap
  ([`9ef7505`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/9ef7505))
  removed the race: no memory cost, and it only responds once the
  client's own write has finished.

All four are things a quick manual pass can miss: the seal check only shows
up by rereading the whole stylesheet, not the markup a design argument is
framed around; the body cap only matters once a crafted request, not the
form, is asking. I verified the whole slice against the exact image the
`Dockerfile` builds — built it locally with `sudo docker build`, ran it with
a `--tmpfs /data` the same way `.github/workflows/checks.yml` does, and ran
`pnpm check` against that running container rather than a locally-started
dev process, so what passed is what CI would see. I also drove it with
`agent-browser`: filled and submitted the form, reloaded to confirm the
colophon was still there and marked "yours", resized 1280×800 to 390×844
mid-typing with the value and focus intact, and tabbed through to confirm
the horizontal scroll strip is keyboard-reachable, not just mouse-draggable.

A third-run pass asked the same "what could a crafted request do" question
of the Cookie header, not just the POST body: a `seal=%` cookie — invalid
percent-encoding no real browser sends, but nothing stops any client from
sending it — threw uncaught inside `decodeURIComponent` before any route
ran, crashing the whole process. Confirmed live against the built image: the
container exited, and the single Fly machine this app runs on would have
needed a restart to serve the next visitor. Fixed
([`6b5e6fb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/6b5e6fb))
by treating a cookie `decodeURIComponent` rejects the same as no cookie at
all, deployed the same run, and reconfirmed live at
`https://comp4020-final-yunlin.fly.dev/` — a bug this severe, already live,
wasn't one to leave for the finishing run.

## The stack, and what it costs

Plain `node:http` over a framework (Express, Hono, Astro) costs more
hand-written routing and no middleware ecosystem, for a slice this size —
four routes, no auth, no JSON API — that isn't much. It buys directness:
every request's path from cookie to database to rendered HTML is one file,
readable start to end, which matters more than middleware convenience while
the app's shape is still being decided. `node:sqlite` over `better-sqlite3`
(used on an earlier crit) costs a newer, less-battle-tested API; it buys no
native module to compile in Docker, a real simplification against the
256MB/one-machine constraint this repo runs under. Neither choice is
final — if next week's real-time layer needs more than an `EventSource` and
a `node:sqlite` poll can give, that trade-off gets revisited and recorded
here, not silently abandoned.

## Verifying the crit's own bar directly, not just its local stand-in

Every prior run's Docker checks ran against `--tmpfs /data` (matching CI),
which proves nothing about persistence — a tmpfs is memory-backed and never
survives a restart either, local or real. The actual claim this crit's brief
asks for — "deployed on Fly, doing its core thing for a stranger, with a
trace that's still there when they come back" — had never been checked
against a real restart of the live machine. This run did: with two existing
colophons already on the live scroll from earlier proof-of-life checks,
`flyctl machine restart` (a full Firecracker VM reboot, confirmed in
`flyctl logs` — `SIGINT` to the Node process, volume unmounted, then a
genuine `reboot: Restarting system` and a fresh boot) left both colophons
exactly where they were. Also confirmed, while reading those logs, that the
server's default `SIGINT` handling (process exits, no custom handler) never
risked a torn write: every `addColophon` call is one synchronous
`node:sqlite` statement, so there's no multi-step commit a restart could
interrupt partway through. Clean result, not a bug — but a different kind of
check from every other verification logged here, since it tests the real
deploy mechanism rather than a stand-in for it.

## A permanent entry means a permanent layout bug too, not just a content one

A fifth-run deepen pass asked a question none of the prior ones had: every
check so far treated "a colophon can never be edited or deleted" as a
security/content question (XSS, length, ownership) — never as a rendering
one. `.colophon-body` had `white-space: pre-wrap` but no `overflow-wrap`,
so a single word with no spaces — well under the 320-character limit, as
ordinary as a pasted URL — had no point to break at. Confirmed live before
touching anything: a 300-character unbroken string pushed `document.body
.scrollWidth` to 2203px against an `innerWidth` of 1280, visibly blowing the
page out sideways in a screenshot. Because nothing can ever remove a
colophon, that one entry would have stayed broken for every future visitor,
forever. Fixed with `overflow-wrap: anywhere`
([`487d6bc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/487d6bc)) —
confirmed live afterward (`scrollWidth` back to 736, matching the intended
46rem body width) at both the desktop and 390×844 marking viewports — and
added a grep-based regression test (`spec/layout.test.ts`) in the same
commit, per this repo's own rule that a found bug gets a test, not just a
patched line.

## An untrusted cookie is a write-boundary input too, not just the POST body

A sixth-run deepen pass asked the "what could a crafted request do" question
(already applied to the POST body and to cookie decoding) of one more thing:
the *length* of a cookie this server trusts as an existing identity.
`sealToken` accepted any non-empty cookie value verbatim, with no shape
check, and wrote it into the append-only `colophons` table on every insert
from that visitor. Confirmed live before touching anything: a 15,000-byte
garbage `seal` cookie landed in the `token` column byte-for-byte — unlike the
colophon body, capped at 320 characters at the same boundary, nothing capped
the one other piece of attacker-controlled data this app ever persists.
Since every token this server issues is a `randomUUID()`, the fix
([`791839c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/791839c))
only trusts a cookie matching that exact shape; anything else gets a fresh
real token instead, bounding the column to 36 bytes regardless of what a
client sends. Confirmed live after the fix: the same 15,000-byte cookie now
gets issued a fresh UUID, and the garbage is never stored. Added to
`spec/cookie-safety.test.ts` alongside the existing malformed-cookie crash
test, since both ask the same question of the same input at two different
boundaries (decode safety, then shape).

## The static-file route, checked rather than assumed safe

A seventh-run deepen pass asked the same "what could a crafted request do at
the API boundary" question of a route none of the prior six had touched:
`GET /public/*`, which reads `.${url.pathname}` straight off disk, gated only
by `startsWith("/public/")`. Rather than trust that WHATWG URL parsing
collapses dot segments before that check runs, I confirmed it live against a
running instance: plain (`/public/../README.md`), percent-encoded
(`%2e%2e`), double-encoded (`%252e%252e`), backslash, and encoded-slash
traversal attempts all 404 — the normalisation happens during `new URL(...)`
construction itself, before the route's own prefix check ever sees the
string, so a `..` segment never survives to reach the filesystem read. A
clean result, not a bug, but worth locking in as
[`c1c9fdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/c1c9fdf):
a regression test, not just a reasoned-through assumption, against whatever a
future refactor of that route does.

A ninth-run cross-read of the whole `spec/` directory found that test was
weaker than it claimed. `fetch` (like `curl` without `--path-as-is`) runs a
path through the same WHATWG parser on the client side, so
`/public/../README.md` left the test process as `/README.md`: five of its
eight cases never sent the server a traversal at all, and the "live" check
behind it had the same blind spot. The server was still safe — its own
parser normalises a raw path just the same — but the test couldn't have
failed for the reason it named. Fixed in
[`e58a34c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/e58a34c)
by sending each path verbatim over `node:http`. The same read surfaced a
second gate I'd never credited: only `.avif`/`.css`/`.svg`/`.ico` are ever
read, and nothing with those extensions exists outside `public/` in the
image, so the route's safety rests on two independent checks, not one.

## Concurrent writes and the artefact's HD-band checks, both closed clean

An eighth-run deepen pass tried two angles crit 7's own write-endpoint
lessons name directly but this repo had never run: whether `addColophon`
holds up under genuinely concurrent requests, and the keyboard/resize/
slow-connection trio the course's artefact criterion names by example.

`addColophon` is a single synchronous `node:sqlite` insert with no
read-then-write check, unlike crit 7's booking overlap logic — a different
shape of claim, but still only a reasoned one until tested. Fired 40 real
concurrent `curl` POSTs (backgrounded shell processes, not sequential
`await`s) at a running instance: all 40 landed, each exactly once, no
crash, no corrupted row. Locked in as
[`e10f004`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin/commit/e10f004):
`spec/colophon-concurrency.test.ts`, 30 genuinely parallel `fetch` calls via
`Promise.all`, each asserting its own marker appears exactly once on the
page afterward.

The HD-band trio, run against this app for the first time: a full keyboard
walk from `<body>` matched DOM order (header link → scroll figure →
textarea → submit → footer link → wraps), and a fully keyboard-driven
submission (focus, type, Tab, Enter) landed correctly. Typing into the
textarea, resizing live from desktop to the 390px marking viewport with no
reload, then continuing to type and submitting, preserved both the value
and focus with no corruption. A raw CDP script (same flatten-mode
`attachToTarget` technique as crit 7's) throttled the connection to
150kbps/400ms and navigated fresh: the page loaded fully styled in ~5.5s
with no FOUC, correct title/heading/form, and no horizontal overflow —
expected for a plain server-rendered page with no client-side hydration to
race, but confirmed rather than assumed. All three closed clean; no fix
needed.

## A fabricated quote in the README's own sourcing

A ninth-run deepen pass closed two reasoned-but-untested claims about the
`sealGlyph`/`mine` identity logic clean — `sealGlyph` can't throw on any
token shape (an empty-string loop just leaves its hash at 0), and `mine`
can never false-match since both `c.token` and `ownToken` always come from
`sealToken`, which only ever returns a validated UUID on either path — then
turned the content-practices discipline this agent has run on every prior
crit's prose onto `README.md`'s own three cited sources for the first time.
Two checked out exactly: the painting attribution (Wang Yi painted the
portrait, Ni Zan added the pine and rock, 1363, Palace Museum Beijing,
confirmed independently) and the Met essay's "continuous dialogue" phrase
(the source text reads "past and present in continuous dialogue"). The
third didn't: the Hundred Rabbits bullet quoted "a lesser home-brewed tool
tailored specifically to our own needs" as if from the cited interview —
that exact phrase, and nothing close to it, appears anywhere in the source
page (checked against the raw HTML, not a summary). Fixed by replacing it
with two real quotes from the same interview ("if we can use less
technology to solve any one task, we will"; software that "gets smaller
over time, that sheds the superfluous") that support the same point the
bullet was already making, rather than inventing a new one. General
lesson, extending this agent's own standing practice: a citation with
quotation marks is a stronger, more specific claim than a paraphrase, and
needs the source's raw text checked directly, not just the general thrust
of the argument.

## Crit 9: several people at once

This section is an architecture decision record. The decision itself was
made by the pod that wrote this riff's prompt; what follows is how it was
built, why it holds up against `README.md`, and the strongest case against
it.

### Context

`README.md` defines good here as "not a feed, but one object that a small,
unhurried stream of people add to, permanently, leaving a trace the next
visitor can actually find." Crit 9 asks for a change one person makes to
reach everyone else within about a second, without a reload, and for one
written position on how the app behaves with several people at once. Until
this crit the scroll only changed when you reloaded it, and nothing on the
page said anyone else was there.

### Options considered

- **No presence at all.** New lines arrive live; nothing says anyone else
  is reading. The purest reading of "not a feed".
- **A live count, 過眼.** One number: how many browsers have the scroll open
  now. On a real scroll a 過眼 seal records that someone looked, without a
  name.
- **Wet ink.** Show a line while it's being written, or at least that
  someone is writing: the liveliest option, and the closest to chat.
- **Who is here.** Each viewer's seal glyph shown while they look. Rejected
  without much weighing: it turns the anonymous seal into a visible
  identity that follows a person around the page.
- **Transport: polling, WebSockets or server-sent events.** Polling every
  second or two is the simplest and works through anything, but meets "within
  a second" only by hammering a 256 MB machine with requests that are almost
  always empty. WebSockets are two-way, which this app doesn't need (writing
  is a plain form post, and has to stay one so the page works without
  JavaScript), and need an upgrade handshake and framing written by hand on
  `node:http` with no dependency. SSE is one-way, plain HTTP, reconnects by
  itself, and carries `Last-Event-ID` so a reconnecting browser says exactly
  where it got to.

### Decision

Three things are live: new lines, their seals on the painting, and the 過眼
count. Nothing that says *who* is live. Transport is SSE on `GET /events`
([`e1963e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-yunlin-1/commit/e1963e7)).

### Why

A line arriving live is the scroll itself, not news about it: it lands at
the end of the list, oldest first, the way a scroll unrolls, and nothing the
reader is looking at moves. The count is the one deliberate exception to
"nothing about who is here", and it's allowed because it is a number, not a
list: it names no one and says nothing about what anyone did. `README.md`'s
argument was changed in the same commit as the count to say so, and
`CLAUDE.md` gained a rule fixing the line: the anonymous count is allowed;
names, glyphs, typing indicators and activity feeds never are.

### How the scroll treats many people

These are all about lines, not about who is reading.

- **Two lines at once** both land, once each, in the database's id order
  for everyone. Nothing can be edited, so there are no edit conflicts to
  resolve: the only shared state anyone can change is "append a line", and
  appends don't conflict.
- **No gap, no double.** The page records the highest id it rendered and
  opens its stream from there with `?after=`; the browser's own reconnect
  sends `Last-Event-ID`. The server registers a stream and replays from that
  id in one synchronous turn, so no write can fall between the replay query
  and the stream going live, and the client ignores an id it already has.
  The spec reconnects with a stale id while twelve lines are written
  concurrently and checks every one arrives exactly once, in order.
- **One line per seal every two minutes, and 30 a day per address.** Live
  delivery makes a flood worse: a script posting thousands of lines would
  fill every open screen in real time, and nothing can be deleted. The seal
  limit is read from the `colophons` table, so a restart doesn't reset it.
  The address limit is counted in memory and never stored, so visitors stay
  anonymous. Both are configurable, and CI raises only the address limit so
  the load specs can post from one runner ([`e1963e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-yunlin-1/commit/e1963e7)).
- **"Since your last visit."** A cookie remembers the highest id a browser
  was shown; next time, lines other people wrote since then sit under a thin
  rule. Your own lines are never new to you, and lines that arrived live
  while the page was open move the cookie forward, since you saw them.

### Seals on the painting

Every colophon now stamps its writer's seal onto the painting, the way real
collectors' seals accumulate on a scroll
([`ab88c71`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-yunlin-1/commit/ab88c71), [`9d30b82`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-yunlin-1/commit/9d30b82)).

- **The server places them, not the visitor.** A new line takes the first
  free spot from a fixed, scattered list on blank silk and the mounting
  either side of the painting. The spot is stored with the line as fractions
  of the image, so a seal never moves.
- **Off limits:** the figure of Yang Zhuxi and his staff, Ni Zan's pine, the
  rocks, the inscriptions and seal columns down each edge, and the title
  slip, all measured on the scan and written into `src/spots.ts`. A spec
  checks every spot clears them, and it failed on its first run: the
  figure's box was drawn from the tip of his staff, so it swallowed a patch
  of blank silk and touched one spot. The box is now two, body and staff.
- **Two at once:** the spot is chosen inside the same write that saves the
  line, and `node:sqlite` is one synchronous writer, so concurrent lines
  always get different spots. Specced with twelve concurrent writes.
- **When the spots run out**, a new line keeps its seal in the list only.
  The painting is never covered.
- **Colour:** your own seals are vermilion, everyone else's ink. Real seals
  are all red, but here `--seal` means "yours" and nothing else, which is
  what lets a visitor find their own mark among strangers'.

### Consequences

- **One process is what makes in-memory fan-out correct.** Every write and
  every open stream meet in `src/live.ts` because `fly.toml` runs exactly one
  machine. The day there are two, a line written on one never reaches
  streams held by the other, the 過眼 count splits in half, and the address
  limit doubles. The fix then is a shared place both can see (SQLite polled
  by id would do at this scale, Redis pub/sub at a bigger one), not more
  code here.
- **Open tabs keep the machine awake.** `auto_stop_machines = "stop"` stops
  the machine when no requests are in flight, and an open stream is a
  request in flight, so one forgotten tab keeps the app running (and
  billing) until it closes. The heartbeat every 15 seconds, which keeps
  Fly's proxy from dropping a quiet stream, is also what makes this true.
- **Streams are capped at 200**, then a `503`; a browser that's refused
  tries again 15 seconds later from the highest id it holds.
- **The address limit trusts `Fly-Client-IP`**, which Fly's proxy sets on
  every request. Off Fly, anyone can send that header, so locally it's only
  as strong as the honesty of the client.
- **過眼 counts browsers, not people.** One person with three tabs counts
  once; one person with two browsers counts twice.

### The case against

**For no presence at all.** The count makes a quiet object feel watched.
Most of the time this scroll will have one reader, and the honest number
then is a reminder that nobody else is here; the plain wording ("only you
are looking now") softens it but doesn't change it. And even a bare number
nudges toward a feed: it moves, it invites checking, and it makes a visit
about the crowd rather than the painting. For this option to win, `README.md`
would have to put more weight on the scroll as something read alone, the
way a collector unrolled it at a desk, and say the trace a visitor finds
should be the lines, never the people.

**For more presence: wet ink.** The brief asks what several people at once
feels like, and a count is the least it can feel like. Seeing a line form,
or just knowing someone is writing, would make two people at the scroll
together actually *together*, and would make the write limit legible ("the
ink is still wet" is already a phrase on the page). Against it here: it is
the one option that shows what an individual is doing, it is chat's
signature move, and a half-written line is exactly the kind of draft
`README.md` says should be considered before it goes on the scroll. For it
to win, `README.md` would have to drop "not a feed" as the core of what
good means, and argue that a gathering (the 雅集 scholars' gatherings where
scrolls were unrolled and inscribed together) is the model rather than the
slow accumulation over centuries.

### Watched in a real browser

Against a scratch `DB_PATH`, with two `agent-browser` sessions open at once:
the count went from "only you are looking now" to "2 people looking now" in
both when the second opened, and back to "only you" within four seconds of
it closing. A line written in one appeared at the end of the other's list
with no reload, marked as yours only in the writer's, and its seal appeared
on the painting in both, vermilion in one and ink in the other. With one
session frozen through Chrome's lifecycle API while the other wrote, the
line was there on waking. After restarting the server (a deploy's
disconnect) and writing before the browser reconnected, the line arrived by
replay, once. The painting unrolled from its right end in a fresh browser at
1280 and 390 pixels wide and didn't replay on reload, and leaving the page,
having another seal write twice, and coming back put exactly those two
lines under "since your last visit".
