# Prompt: make Colophon live, and decide how it behaves with several people at once

You are taking Colophon from crit 8 (one painting, one anonymous line each,
append-only, no accounts) to crit 9, **"All at once"**. Fetch the brief first
and read it: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/
Nobody is here to answer questions, so everything you need to decide is
decided below. Don't ask, and don't reopen the decision; build it and defend it.

## The goal

When several people have the scroll open at once, a line one of them writes
appears in every other open session **within a second, with no reload**,
stamped as a seal onto the painting itself, and the app has one written-down,
argued position on how it behaves with many people. The scroll stays what `README.md` says it is: an object a small,
unhurried crowd adds to, not a feed.

## The decision (the pod's, fixed)

**Three things are live: new lines, their seals on the painting, and one
number, 過眼, saying how many people are looking right now. Nothing that says
*who* is live.**

- A line appears, for everyone, at the end of the list (oldest first, the way
  a scroll unrolls) as soon as it's written, and its writer's seal appears on
  the painting at the same moment (item 14). Neither ever moves what the reader
  is looking at: no scrolling, no jump, no reordering.
- **過眼, a live count.** On a real scroll a 過眼 seal says "this passed before
  my eyes": a viewer's presence, recorded without a name. Here it is one
  number, how many people have the scroll open right now, rising as people
  arrive and falling as they leave. That is the only presence there is: no
  list of who, no glyphs of who, no typing indicator, no "someone is writing".
  The count is anonymous and fleeting; seals left with colophons stay forever.
- Two lines written at the same moment both land, once each, in the same order
  for everyone (the database's id order), and get two different spots on the
  painting. Nothing is editable, so there are no edit conflicts to resolve; say
  so in the record.
- A visitor who was offline, asleep or on a flaky connection catches up on
  reconnect without losing or doubling a line. A visitor who returns the next
  day just sees the scroll, as now.

**This changes a rule, so change the argument first.** `README.md` says there
is "no feed of other people's activity", and `CLAUDE.md` says that if a change
would break one of its rules, the argument in `README.md` changes first, in the
same commit. A count is not a feed (it says nothing about who or what anyone
did), but say so explicitly: update `README.md`'s argument and add a rule to
`CLAUDE.md` saying what presence is allowed (the anonymous 過眼 count) and what
never is (names, glyphs or anything else identifying who is looking, typing
indicators, activity feeds). Do it in the commit that adds the count.

The pod will argue for an option you didn't choose, so the record in
`PROCESS.md` must give the strongest honest case **against** this decision,
in both directions: for no presence at all (the count makes a quiet object feel
watched, and an empty room says "0 looking"), and for more presence ("wet ink"
for a line being written). Say what would have to change in `README.md` for
each to win.

## What done looks like (all of it checkable)

Write these as `spec/` tests against the running app, over HTTP, like the
existing ones. A bug you find along the way gets a test or a rule in
`CLAUDE.md`, not just a patched line (that is already a rule here).

1. **Live, in under a second.** `GET /events` is a server-sent-events stream
   (`text/event-stream`). With a stream open, a `POST /colophons` from another
   client delivers that line on the stream in **under 1000 ms** (measure it).
   Two streams open at once both receive it.
2. **"Yours" stays true.** The line arrives marked as yours only on the stream
   whose cookie wrote it; on every other stream it is plain. The accent colour
   (`--seal`) keeps its one meaning: live arrivals from other people must not
   get it, and `spec/accent.test.ts` stays as it is. The seal token itself
   never appears in any event.
3. **Still escaped.** A body containing `<script>`, `</script>` and `&` arrives
   on the stream escaped. There is one function that renders a colophon, used
   by both the full page and the live event, and it goes through `escapeHtml`.
   (`CLAUDE.md`: no user text reaches a template unescaped.)
4. **No gap, no double.** The page records the highest colophon id it rendered
   and the client opens the stream from there (`?after=<id>` or `Last-Event-ID`),
   so a line written between the page loading and the stream connecting is
   delivered by replay. Reconnecting with a stale `Last-Event-ID` replays
   exactly the lines missed, in order, none twice, even while other lines are
   being written concurrently. The client ignores an id it already has.
5. **Works without JavaScript.** `GET /` still shows every line and the form
   still posts to `/colophons` and redirects. The live layer is progressive
   enhancement. With a script, submitting stays on the page (the textarea
   empties, scroll position is kept, and an empty or over-length line shows the
   same message as today); without one, the old redirect. Respect
   `prefers-reduced-motion`; a gentle fade-in on a new line is fine.
6. **Fits one small machine.** `fly.toml` is one `shared-cpu-1x` with 256 MB,
   one machine, `auto_stop_machines = "stop"`. Send a heartbeat comment at
   least every 20 seconds (the proxy drops idle streams), remove a stream's
   listener when its connection closes, and cap concurrent streams (say 200,
   then `503`). Test that opening and aborting a few hundred streams leaves the
   server answering normally. Don't add Redis, a queue or a second machine:
   in-memory fan-out is correct *because* there is exactly one process, and the
   record should say that and what breaks the day there are two. Don't edit
   `fly.toml`. Do note in the record that open tabs keep the machine awake.
7. **過眼: how many are looking, live.** The count is the number of distinct
   seals (browsers) with the stream open right now, so one person with three
   tabs counts once. It is pushed on the same stream whenever it changes, at
   most once every couple of seconds so arrivals and departures don't flicker.
   It falls within a few seconds of someone closing their tab (use the
   connection's close, and let the heartbeat catch connections that died
   silently). The event carries the number and nothing else: no tokens, no
   glyphs. Show it near the title as a small 過眼 seal mark beside "3 people
   looking now" (singular for one, including yourself; when only you are here,
   say so plainly). It is not `--seal` vermilion. Without JavaScript the page
   shows the count as it was when served. Spec: two streams with different
   cookies count 2; a second stream with the same cookie still counts 2;
   closing one drops it back, within a few seconds; the event's payload is
   only the number.
8. **Unhurried, enforced.** Live makes a flood worse: a script posting
   thousands of lines would fill every open screen in real time, and since
   nothing can be deleted it would stay on the scroll forever. Limit writing at
   the boundary, like the length check: one line per seal every 2 minutes, read
   from the `colophons` table itself; and at most 30 lines a day from one IP
   address, so a script can't get round it by dropping its cookie. Count IPs in
   memory only and never store an IP in the database: visitors stay anonymous.
   On Fly the client address is the `Fly-Client-IP` header; locally, the
   socket. A line over the limit is rejected, not stored and not broadcast,
   with its own message ("The ink is still wet on your last line. Give it a
   few minutes."), and the script path shows the same message. Answer it the
   same way as the other rejections; item 20 changes how all of them come back,
   so they keep the visitor's text.
   The existing concurrency and load specs post many lines from one machine
   and must keep passing, so make the limits configurable by environment
   variable with these defaults, relax them for the test container in
   `.github/workflows/checks.yml` (and locally), and have a spec prove the
   limit holds at whatever value the app was started with.
9. **"New since you last unrolled it."** The brief asks what someone sees when
   they come back. When the page is served, remember in a cookie the highest
   colophon id this browser was shown. On the next visit, lines written since
   then (by other people) get a quiet mark: a thin rule and the words "since
   your last visit" above the first of them. On a first visit, mark nothing. A
   line you wrote yourself is never "new" to you. Lines arriving live while the
   page is open aren't marked this way; they already arrive in front of the
   reader. Do it on the server so it works without JavaScript, and don't use
   `--seal`: it means "yours" and nothing else. Spec: visit, have another
   client write two lines, visit again and exactly those two are marked, then
   visit a third time and nothing is.
10. **The painting unrolls on a first visit.** A handscroll is unrolled slowly
   from its right end, never seen all at once. The first time a browser
   arrives (the request where the server issues its seal cookie), the painting
   opens the same way: it unrolls from where a real handscroll starts, with a
   rolled edge travelling across, over about two to three seconds. Look at
   `public/scroll.avif` to get the direction and the starting end right. Rules:
   - The server adds a class on that one response only; the animation itself
     is CSS, so it works without JavaScript and never replays on later visits.
   - Under `prefers-reduced-motion` there's no animation, just the painting.
   - The animation's end state is today's normal state, so if it doesn't run
     the painting is simply there. It never covers or delays the colophons or
     the form, and nothing on the page waits for it.
   - Spec: a request with no cookie gets the class; one with a valid seal
     cookie doesn't. The stylesheet has a reduced-motion rule turning it off.
11. **Verified in a real browser, not just by tests.** Run the app locally
   against a scratch `DB_PATH`, open **two browser sessions at once** and watch a
   line written in one appear in the other with no reload, then do the same
   after putting one to sleep and waking it. Watch the 過眼 count go up when
   the second session opens and back down when it closes, and (once item 14 is
   in) the new seal appear on the painting in both sessions. Also watch the unroll in a fresh
   private window at desktop and phone widths, see it not replay on reload,
   and see the "since your last visit" mark after a second session writes.
   `README.md` makes claims about behaviour; any sentence you add about live
   behaviour must be something you watched happen.
12. **The record.** Add a section to `PROCESS.md` in the architecture-decision
   shape: context, options considered (at least: no presence, a live count,
   wet ink for a line being written, polling, WebSockets vs SSE), the decision,
   why, consequences, and the case against above. Include the write limit and
   the "since your last visit" mark as part of how the scroll treats many
   people (both are about lines, not about who is here), the 過眼 count as the
   one deliberate, anonymous exception, and the seal decisions from item 14:
   who places a seal, two at once, what's off limits, what happens when the
   painting fills up. Ground it in `README.md`'s
   own definition of good, quoting it. Cite commits by hash; `pnpm check:evidence`
   must stay green, so every citation must resolve. Update `README.md`'s
   "What I chose not to build", which still says real-time belongs to a later
   crit, so it's true again. Don't write a `reflections/` file: nothing in this
   repo is marked.

## Then: the scroll as an exhibition

Do this **after** items 1–12 work and are pushed. The live layer is the brief;
this is the pod's wish list for making the page worthy of the painting. If you
run short, finish these in order and say in `PROCESS.md` which ones you
didn't get to, rather than leaving any half-done. Items 13 and 14 come first:
the seals on the painting are part of the decision above, and they need the
bigger painting to be readable. Every script-based part here
is progressive enhancement: with JavaScript off, the page still reads and
writes exactly as it does now.

13. **The painting is the focal point.** The scroller is 9rem (144px) tall.
    Make it the biggest thing on the page: tall enough that the figure, the
    pine, the rocks and the old inscriptions can be seen without zooming, on
    desktop and on a phone. **But `public/scroll.avif` is only 2400×163
    pixels**, so enlarging it as it is only blurs it. First find a
    higher-resolution image of the same painting (Wang Yi and Ni Zan,
    *Portrait of Yang Zhuxi*, 1363, Palace Museum) whose licence allows reuse,
    for example a public-domain scan on Wikimedia Commons. Credit it in the
    caption with its source and licence, and keep it a small, fast AVIF or
    WebP; the old one was 42 KB, so stay well under a megabyte. Don't display
    it taller than its real pixels allow. If no better image exists, say so in
    `PROCESS.md` and stop at the largest size that stays sharp.
14. **Seals on the painting** (the pod's main idea for this run). Every
    colophon puts its writer's seal onto the painting itself, the way real
    collectors' seals accumulate on a scroll; tapping a seal shows the line
    behind it, and a new seal appears on every open page, live, with its line.
    Decided:
    - **The server places seals, not the visitor.** When a line is saved, it
      gets the first free spot from a fixed, scattered list of spots on blank
      silk and empty ground. Store the spot with the colophon (new columns,
      as fractions of the image's width and height, added the same additive
      way as the rest of the schema), so a seal never moves once placed.
      Existing colophons get spots in id order when the column is added.
    - **Off limits:** the figure of Yang Zhuxi, the pine, the rocks and the
      title slip. Look at the image and measure these regions yourself; write
      them in the code with a comment saying what each one covers. Positions are
      fractions of the image, so if item 13 swaps in a sharper scan, measure
      again and check every seal still sits on blank silk.
    - **Two at once:** spots are handed out inside the same write that saves
      the line (`node:sqlite` is one writer), so two lines written at the same
      moment always get different spots. Spec: concurrent writes, all distinct.
    - **When the spots run out**, new lines keep their seal in the list only.
      The painting is never covered. Spec it with a small spot list.
    - **Colour:** your own seals are vermilion; everyone else's are ink (a thin
      ink border, the glyph in ink, slightly translucent over the silk). That
      keeps `--seal` meaning "yours"; extend the allowed selectors in
      `spec/accent.test.ts` only for your own seal on the painting, and say why.
    - **Without JavaScript**, each seal is a link to its colophon in the list
      (`#c-<id>`); with it, a small popover shows the line and its date, with a
      link down to the list. Seals are keyboard-reachable buttons or links with
      a label, at least 24 px to tap, and the existing text list stays below the
      painting as the full, readable record, since small seals are hard to tap
      on a phone.
    - Seals never hide the detail markers of item 21: when details are shown,
      seals fade back.
15. **Paper, ink and a mounted scroll.** Keep the warm ivory paper. Add a subtle
    paper texture (CSS or a tiny tiled image) and mounting borders around the
    painting, like silk brocade framing a scroll on display. Links and buttons
    are coordinated in **ink tones**. Vermilion (`--seal`) stays reserved for
    one thing, a colophon that is yours: that rule is in `CLAUDE.md` and
    `spec/accent.test.ts`, and a seal means something because nothing else
    is that colour. Keep that test unchanged.
16. **Colophons read as inscriptions.** Give text, date and seal a clear
    hierarchy and generous spacing, so each line sits like a brushed note rather
    than a comment. Use a serif stack that renders Chinese well for the seal
    glyphs and any Chinese text (`"Songti SC"`, `"STSong"`, `"Noto Serif SC"`,
    `"Noto Serif TC"`, `"Source Han Serif"`, then serif). Don't ship a
    multi-megabyte CJK web font; if you use one at all, subset it to the
    characters you need. `spec/layout.test.ts` stays green.
17. **Restrained motion.** Besides the first-visit unroll (item 10), a line
    arriving live spreads in like ink on paper: blurred and faint at first, then
    sharp and dark, over about a second and a half. Its new seal on the
    painting arrives the same way. When **your** line lands, your seal is
    stamped instead (a brief press-and-settle), in the list and on the painting. Under
    `prefers-reduced-motion` all of it is off. Nothing moves that the reader
    didn't cause or isn't new.
18. **Getting around the painting.** A clear hint that the painting scrolls
    sideways (a fading edge and "scroll →", gone after the first scroll). Zoom
    in and out buttons and a fullscreen mode (the Fullscreen API) so the details
    are reachable on a phone. Zooming keeps the point under the reader's view
    roughly in place, and pinch-zoom still works on touch. All of it works by
    keyboard, with visible focus and labelled buttons, and with no new
    dependency.
19. **Writing an inscription.** A live character counter (counting down from
    320, announced politely to screen readers). A preview that shows the line
    with your own seal glyph beside it, as it will appear. Beside the button, a
    plain sentence that once it's written in, it can't be changed or taken
    back; with JavaScript, the first time a browser writes, the button asks for
    one inline confirmation step, never a `window.confirm` pop-up. Without
    JavaScript, the note is there and the form posts directly.
20. **Clear feedback, and nothing lost.** After a successful write, the page
    lands on your new line and stamps its seal. Give every colophon an anchor
    (`id="c-<id>"`); without JavaScript, redirect to `/#c-<id>` so the browser
    scrolls there. On any rejection (empty, too long,
    too fast), the text the visitor typed comes back in the textarea with the
    message, so they never have to rewrite it. With JavaScript it simply stays.
    Without it, answer the rejected POST by rendering the page with the error
    and the text in place, not a bare redirect. `spec/colophon.test.ts`
    currently expects a 303 with `?error=`; update it to the new response, and
    keep its "not stored" and "not truncated" assertions as they are.
21. **Help visitors understand what they're looking at.** A short "About this
    painting" note (a few sentences: who painted what, when, and why colophons
    are added to a scroll) and a handful of marked details on the painting
    itself (the figure of Yang Zhuxi, Ni Zan's pine and rocks, the older
    inscriptions and seals), each with one or two sentences. **Every fact must
    come from a source you actually read and cite** (Palace Museum, the Met's
    handscroll essay that `README.md` already cites, Wikipedia with its
    references). This repo once shipped an invented quote and had to fix it in
    `f7d259f`; don't repeat that. Check the markers sit on the right parts of
    the image at several widths and zoom levels, and that they're reachable by
    keyboard.

Item 4 already covers the pod's last wish, showing new lines gently without
moving the reader.

Client code goes in a plain script under `public/`. The static route only
serves `.avif`, `.css`, `.svg` and `.ico` today, so add the types you need
(`.js`, `.webp`, a font if any) to its MIME map, and keep the traversal guard
and `spec/static-files.test.ts` as they are. Check items 13–21 in a real
browser at desktop and phone widths too, as in item 11.

## Keep, and leave alone

- `node:http` and `node:sqlite`, no framework, **no new dependencies**: SSE
  needs none. Keep `src/` small; this repo's taste is what it leaves out.
- The painting itself (item 13 may swap in a sharper image of the same work,
  never a different one) and the look's restraint: items 13–21 refine it, they
  don't replace it with something busier. The 320-character limit (reject, never truncate),
  append-only (no edit, no delete), the seal as an anonymous per-browser token,
  and every rule in `CLAUDE.md`: no accounts, names, likes, replies, threads or
  notifications. Leave the top block of `CLAUDE.md` as it is.
- The existing specs gate the deploy. Keep them green; change one only where the
  new behaviour truly changes its subject, and say why in the commit.
  `spec/invariants.test.ts` must stay green untouched.
- The 16 KB request cap, the cookie-shape check and the static-file guard.
- **Never write test lines into the live scroll.** Everyone who visits sees
  them for good. Test only against a scratch `DB_PATH` locally. On the live site,
  after deploying, only check that `/` is 200 and that `/events` connects and
  sends its first heartbeat or `retry:` line.

## Read first

- `README.md` and `CLAUDE.md` (the rules and the argument they come from)
- `src/server.ts` (routes, `readBody`), `src/db.ts` (one synchronous
  `DatabaseSync`; `addColophon` returns nothing yet, so fan out only after the
  insert commits and give it the new row), `src/render.ts` (`colophonEntry`)
- `spec/colophon-concurrency.test.ts` and `spec/request-limits.test.ts` as
  the pattern for load and limits; `spec/README.md`
- Server-sent events: `Last-Event-ID`, `retry:` and `: comment` heartbeats
  (MDN, "Using server-sent events"). Send headers immediately
  (`res.flushHeaders()`), `Cache-Control: no-cache`, and `X-Accel-Buffering: no`
  so nothing between you and the browser buffers the stream.

## Finishing

Run `pnpm check` and `pnpm check:evidence` against the app built from the
`Dockerfile`, as CI does, then push to `main` (CI deploys every push). Confirm
the live URL as described above. Keep `main` deployable at every commit, commit
in small steps with messages that say what changed and why, and **delete
`prompt.md` in your last commit**.
