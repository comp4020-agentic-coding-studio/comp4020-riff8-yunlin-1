# Pod 1, crit 9 → crit 10: tell people apart, keep a provenance record, and make a mark in three steps

The next brief is crit 10, "Fly by instruments" (week 11):
<https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/>.
Read it first. At that crit two people will open this app from its URL alone,
each in a separate Chrome profile, and use it side by side. Someone who never
touches the app has to narrate, **from `flyctl logs` alone**, who did what. If
the narrator can't tell the two apart in the logs, or one of them can change
what should be the other's, that is the failure.

## Where the app is now (what we found)

- **There is no logging.** The only `console.log` in `src/` is the startup
  line in `src/server.ts`. Writing a line, carving a seal, clearing a seal and
  being refused all leave no trace in the logs.
- **The visible identity collides.** A visitor's default seal comes from
  `sealGlyph()` in `src/seal.ts`, which picks one of 12 characters. Two
  people have a 1-in-12 chance of the same seal, and in a room of five, two of
  them probably share one. On screen, and in any log keyed on the glyph, two
  different people can look like one.
- **What each person may change is already partly enforced, but not written
  down as a decision.** Colophons can't be edited or deleted by anyone. A seal
  can only be carved or cleared by its own cookie (`saveSeal` / `clearSeal`),
  and is fixed once used (409 `fixed`). But nothing records this as a rule
  with its reasons, and no spec checks it across two separate visitors.

## The goal

The handscroll tradition already has the answer to "who did what". Collectors
stamped their seals on the scroll and wrote colophons after it, and that
record is the scroll's **provenance**. Make the server keep that record: a
provenance log in which every action is one line naming the visitor the same
way the page shows them. The narrator should be able to point at the screen
and say "that seal wrote that line", and the log should agree.

## What good looks like (checkable)

1. **Every action logs one line to stdout**, server-side, in a single format
   that's easy to read from `flyctl logs` (for example `provenance` followed
   by key=value pairs). The actions are:
   - a first visit (a new seal issued)
   - a line written (with its colophon id)
   - a seal carved or cleared
   - every refusal (empty, too long, wet ink, seal fixed, payload too large,
     invalid seal)
   - a live stream opened or closed

   Each line has: the time, the action, the outcome, and the visitor's
   **public handle**.
2. **A public handle that tells people apart**: the visitor's seal glyph
   plus a short, stable tag derived from their token by a one-way hash (e.g.
   `鑑·4f2a`). The same handle appears on the page beside that visitor's
   seal (their own "your seal" area, and on each colophon they wrote), so a
   narrator can match the screen to the log. Two separate browsers must get
   different handles. Keep the tag visually quiet, like a small seal
   inscription, not a username badge. It must not appear in the 過眼 presence
   count or anywhere that shows who is *looking*, and it must not take on the
   `--seal` accent (both are rules in `CLAUDE.md`).
3. **Never log a secret.** The raw seal token is the visitor's credential, so it
   must never appear in a log line or on the page. Don't log full IP
   addresses, and don't log the text of a colophon (the id is enough; the
   line is already public on the page).
4. **The "who may change what" rule is written down** as a new section in
   `PROCESS.md`. It should cover:
   - what a visitor may see
   - what they may change (their own seal, until it's fixed)
   - what nobody may change (any colophon, anyone else's seal)
   - why, argued from `README.md` (ink doesn't come off the paper)
   - where each rule is checked on the server
5. **A spec proves it across two visitors.** Visitor A and visitor B have
   separate cookie jars:
   - they get different handles
   - B cannot clear or re-carve A's seal
   - nobody can edit or delete a colophon
   - each action produces a provenance line with the right handle and none
     of them contains a raw token

   If capturing stdout in the spec is awkward, have the server also keep the
   last N provenance entries in memory and assert against that. Don't add a
   public endpoint that exposes it.
6. **It's deployed** and the provenance lines are visible in
   `flyctl logs -a comp4020-riff8-yunlin-1` after you exercise it against the
   live app.

## The layout: two panels, and making a mark in three steps

Our pod also wants the page reorganised:

- **Left panel: the painting.** It keeps its existing viewer (zoom, Details,
  Full screen) and the seals on it. It stays in view while the right panel
  scrolls.
- **Right panel: tabs**, denser than the current long page:
  1. **About this painting**: the content of `renderAbout()`, including the
     numbered details list, which stays linked to the markers on the
     painting.
  2. **Make your mark**: a guided flow in three numbered steps.
     1. *Choose your seal.* Either pick a ready-made seal (a character and a
        style, 朱文 `zhu` or 白文 `bai`), or carve your own with the existing
        carving tool (`src/carve.ts`, the guides in `public/guides/`).
     2. *Choose where it goes on the painting.* Click a spot on the left
        panel. Only free spots on blank silk are allowed: the same spots
        `src/spots.ts` already defines, with the same clearance from other
        seals. Show which spots are free, and show a preview of the seal on
        the chosen spot.
     3. *Write your colophon.* The existing desk: 320 characters, the
        preview, and the "can't be taken back" note. Submitting saves the
        line, the seal and the spot together.
  3. **Colophons**: the list of lines that's under the painting now.
     Clicking a seal on the painting opens this tab at that line.

Rules for the layout:

- **The server decides the spot, not the browser.** The server checks that
  the chosen spot is one of the allowed spots and still free, at the moment
  of writing, inside the same write that saves the line. If two people pick
  the same spot at once, the first wins. The second gets a clear "that spot
  was just taken, choose another" message, and keeps their draft. Placing,
  and being refused a spot, are both provenance log lines.
- **It still works without JavaScript.** Without a script the tabs are
  plain sections down the page, and the form still posts. A line written
  without choosing a spot gets the first free one, as now. Carving and
  clicking a spot are enhancements on top, as `CLAUDE.md` requires.
- **Phones:** below about 900px wide the panels stack, with the painting on
  top. There's no sideways scroll at 375px.
- **The tabs are accessible:** they follow the ARIA tabs pattern, work from
  the keyboard, and the URL hash opens the right tab
  (e.g. `#mark`, `#c-42`).
- **Choosing a ready-made character makes seals collide more**, which is
  one more reason the handle in point 2 above needs its short tag.

**Order of work:** do the crit 10 parts first (the provenance log, the
handle, the written rule and the two-visitor spec), because the next crit
tests them. Then do the layout, and log the new placement step the same way.
Keep `main` deployable after each part.

## Keep, and leave alone

- No accounts, names, emails or passwords. A visitor stays an anonymous seal,
  which is the README's core argument. The handle is a seal, not a username.
- Colophons stay append-only and un-editable. The live stream, the presence
  count, carving and the painting viewer all keep working. The layout moves
  them into the panels; it doesn't remove them.
- The existing spec tests and `spec/invariants.test.ts` stay green. Change an
  existing test only if the handle genuinely changes what it checks, and say
  why in the commit.
- Keep using `node:sqlite` and the current stack. Add no logging library: a
  small function in `src/` that formats and writes the line is enough.

## Pointers

- `src/server.ts`: every route, and where each log call goes.
- `src/cookies.ts` (`sealToken`): where a new visitor is issued a seal.
- `src/seal.ts` (`sealGlyph`): where the handle should be derived.
- `src/limits.ts`: the refusals (wet ink, per-IP room).
- `src/live.ts`: stream open and close.
- `src/render.ts`: the page layout, including `renderAbout()`, the
  painting viewer, the carving desk and the colophon form.
- `src/spots.ts` (`SPOTS`, `firstFreeSpot`): the allowed spots.
- `src/db.ts`: where a line's spot is saved today.
- The Crit 9 sections of `PROCESS.md`: how the app already behaves with
  several people at once.
- The crit 10 brief linked above.

When you're done, update `README.md`'s "what the spec checks" and add the
`PROCESS.md` section described in point 4. Then delete this file in your last
commit, as `CLAUDE.md` says.
