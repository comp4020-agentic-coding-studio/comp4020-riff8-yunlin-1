# Pod 1: Paper Planes — six colours, written messages, and chosen regions

Build a working, visually faithful recreation of <https://paperplanes.world/> in **`comp4020-agentic-coding-studio/comp4020-riff8-yunlin-1`**, with four deliberate changes:

1. Replace the six-theme idea with **six colours of paper plane**.
2. Make the complete experience usable in a **desktop web browser**, as well as on a phone.
3. Let people **choose a region label themselves**, rather than requiring their physical location.
4. Let people **write a message on their plane**. When someone catches it, that same message must be visible on the paper itself and fully readable.

Keep the reference's visual composition and central experience as close as practical: a shared world, folded paper planes, catching, unfolding, region stamps, journey history, and sending planes onward. This is a functioning multiplayer application, not a landing page, animation-only demo, or collection of UI mockups. Complete it in one unattended run; make reasonable decisions where this brief leaves details open.

## Repository and assignment context

This is the **yunlin-1** pod repository. Its current product is **Colophon**, a painting with anonymous inscriptions and seals. Do not assume that Liuru's six categories exist in this codebase. The requested paper-plane experience is an intentional product redesign; implement its six colours directly. Work only in this pod repository and its Fly app, `comp4020-riff8-yunlin-1`. The original final-project repository and all liuru repositories/deployments are out of scope.

Read the root `CLAUDE.md`, `README.md`, the relevant `PROCESS.md` sections, application source, database code, deployment configuration, and tests first. Keep the top pod-riff block in `CLAUDE.md` intact. Its permission to change tests for a different brief applies: replace obsolete painting-layout expectations with meaningful plane tests, explain the changes, and keep `spec/invariants.test.ts` green. Update the README's product argument and any conflicting lower-level product rules together with the redesign. Do not let old painting-specific presentation rules prevent the requested experience.

Preserve stored colophons, seals, and their relationships through an additive migration. Keep the old content readable through a discreet archive link, outside the new primary flow. Do not invent colours, regions, or journeys for legacy inscriptions. Reuse the existing anonymous visitor mechanism, Node/TypeScript server, SQLite persistence, validation, and live infrastructure where suitable. A maintained 3D rendering library is appropriate; a wholesale backend rewrite is not required.

Continue to satisfy the operational purpose of [Crit 10: Fly by instruments](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/): two independent browsers can act on shared state, the server distinguishes them and enforces their permissions, and someone can narrate their actions from server logs alone. The pod exemption from graded reflections and compulsory process entries still applies. Document the new permission model and implementation decisions in the repo without inventing a grading obligation.

## Reference and visual fidelity

Inspect the live reference and its available screenshots before building. The original's desktop presentation currently displays the globe and asks visitors to join on a phone; **our desktop version must expose all interactions directly**. For the original interaction sequence, consult [Active Theory's project case study](https://medium.com/active-theory/paper-planes-6b0008c56c17) and the [official One Show project record](https://www.oneclub.org/awards/theoneshow/-award/25379/paper-planes/). If the mobile interaction cannot be accessed, use those records and the explicit requirements below; do not stall or claim to have observed unavailable screens.

Match the reference's defining scene: a full-window pastel sky, a prominent slowly rotating low-poly globe, softly lit folded planes moving around it, and sparse interface controls. Preserve its sense of scale, depth, soft colour, gentle movement, and playful catching/throwing. Use locally implemented geometry, animation, and UI; identify this as a student recreation in a small About panel with a reference link, without claiming an official affiliation.

Use lilac, pale blue, blush, and teal for the atmospheric background and faceted globe. Give planes a recognisable pointed nose, central fold, two wings, thin paper edges, and subtle fold shadows. Avoid replacing the scene with a flat map, paper-plane emoji, generic dashboard, large card grid, or conventional hero-and-feature landing page. Keep controls legible over the scene and ensure the globe never blocks a form or readable message.

The six available plane colours are **Coral `#F27D8A`, Orange `#F6A66B`, Yellow `#F2D46B`, Mint `#81C8AB`, Blue `#7CAFE5`, and Lavender `#AE94D8`**. These are six equal paper options, not the old dream/illusion/bubble/shadow/dew/lightning categories. Apply the choice to the actual plane material, including folded and unfolded views. Keep its inner writing surface pale enough for dark, readable ink. Colour never indicates authorship, popularity, or permissions. Pair swatches with names and a selected indicator.

## The complete interaction

### 1. Enter the shared world

Open directly into the globe scene with discoverable **Create a plane**, **Catch a plane**, and **Your planes** controls, a small sound toggle, and a short first-use instruction. No account, installation, QR code, second device, or sensor permission is needed. Keep the scene visible through transitions, but dim or slow it when reading or writing needs attention.

Render real circulating planes when data exists. Any ambient decorative planes must be visually secondary, non-catchable, and excluded from activity, messages, and counts. An empty world must give an honest invitation to create the first plane, not fabricated visitors or journeys.

### 2. Write, choose a colour, and add a region

Show a large open sheet of paper in the foreground. Provide a real, accessible textarea aligned with its writing area and a live preview of the ink on the paper. Accept Chinese, English, emoji, spaces, and line breaks. Preserve the existing 320-character limit, use one documented Unicode counting rule on client and server, display a counter, and reject empty or over-limit submissions without silent truncation. Render all messages as plain text, never executable markup.

Show the six colour choices and a searchable **Country / region** selector with an optional city selector where curated city data is available. Do not require a city. Use a local, stable catalogue with canonical IDs and display labels, covering global regions; derive approximate map coordinates from the selected entry. Examples include Australia / Canberra and Japan / Tokyo. The label is freely chosen and is not a verified claim about the visitor's location. Explain this briefly beside the selector. Do not ask for GPS, infer a compulsory region from IP, or make a paid geocoding service necessary.

Preview the chosen region as a stamp printed on the sheet. Require a valid colour, region, and message before launch. Changing any field updates the preview without losing the draft. Allow **Fold** and **Back to edit** before submission. The folded preview must already show some of the written text on a visible wing; its text should move and rotate with the paper.

### 3. Fold and launch

Animate the sheet folding into the selected coloured plane. On desktop, support dragging the plane forward/upward and releasing it, plus a prominent **Throw plane** button. On touch devices, support an upward swipe and the same button. Optional motion controls must never be the only way to launch.

Commit the plane to the server once. Only after confirmed success should it leave the foreground and join the shared sky. Preserve the draft on failure and show an understandable retry state. Repeated clicks, gesture/button overlap, and an uncertain network retry must not create duplicate planes; use a server-backed idempotency mechanism.

Every other connected browser should receive the committed plane within about one second without refreshing. Its ID, colour, message, author handle, and origin stamp must agree across browsers. Do not mistake a local animation for successful publication.

### 4. Catch a real plane

Click **Catch a plane** to enter a catching mode with a clear pointer-controlled net/target. A desktop visitor can click a visible eligible plane; a touch visitor can tap one. Also provide an accessible **Catch an available plane** button so catching does not depend on precision, vision, dragging, or animation.

Select a real persisted plane that is currently available. Prefer someone else's plane when possible. If only the visitor's own plane is available, allow a clearly labelled self-catch; if none is available, show an honest empty state. A successful catch brings that exact plane toward the camera and holds it still for inspection. Never substitute a random canned message or another plane's metadata.

### 5. Read the words on the paper

**The captured plane itself must display the message written by its sender.** This is a central acceptance condition, not an optional tooltip or separate text card.

In the close-up folded view, show real ink on the visible wing. Provide **Open / Unfold** to animate it into a readable sheet containing the complete original message, colour identity, origin stamp, and subsequent region stamps. Text should appear attached to the paper surface through an appropriate texture or correctly transformed DOM layer; a screen-fixed label floating beside the plane is insufficient. Keep an accessible HTML representation of the same full message.

Long messages must wrap within the paper, including CJK and unbroken strings. In the unfolded view use readable type, at least 16px at normal mobile sizing; allow the writing area to scroll if necessary rather than shrinking everything to illegibility. Preserve line breaks. A shortened preview on a distant/folded plane is acceptable only when the full original text is available immediately on opening it. Do not cover the message with stamps or clip it behind folds.

The catcher can read the message but **cannot rewrite the original text, change its colour, replace its origin region, or impersonate its author**.

### 6. Stamp and send onward

While holding a plane, let the catcher choose their own country/region, preview a new stamp, and use **Stamp & send onward**. Append the new stamp and release the same plane in one successful transaction. Retain its original ID, message, colour, author, origin stamp, and all earlier stamps. Offer **Release without stamping** as well. Folding and rethrowing should feel like a continuation of the reference experience.

Show the ordered stamp history with a small globe route connecting the chosen regions. Any distance is an approximate distance between selected region centres, explicitly labelled as a virtual journey; do not imply GPS tracking or verified travel. Adjacent identical locations should not produce a spurious flight segment.

**Your planes** lets the current anonymous browser reopen planes it created and inspect their current stamp history and virtual routes. This is a quiet retrieval view, without public rankings, likes, follower counts, chat, or notifications.

## Real shared state and permissions

Persist each plane's ID, immutable original body, colour, origin-region ID, creator reference, creation time, ordered stamp events, and current availability. Keep secrets separate from public records. Local storage may hold preferences and unfinished drafts, but cannot be the shared database or authority for permissions.

Implement a clear server-owned state model: local draft → available in flight → temporarily caught → available again. Acquire catches atomically. If two visitors try to catch the same plane, exactly one obtains it and the other receives useful feedback. A short, renewable catch lease with a visible timeout warning is sufficient; release abandoned/expired holds so a closed tab cannot strand a plane permanently. Expiration affects availability, never the stored message or history.

Only the current lease holder can stamp/release that held plane. Validate identity, lease, colour enum, region IDs, text length, and request size on the server, including forged direct requests. Make repeat stamp/release requests idempotent. Keep chronological history stable under concurrency. Do not trust an author ID or owner flag sent by the client. Follow the existing application's request-origin, cookie, and write-limit protections; adapt painting-specific limits with documented reasoning where needed for catching and relaunching.

Preserve real-time updates and reconnect recovery. After refresh, reconnect, or server restart, committed messages, colours, and stamps must remain; the UI reconciles with server state without duplicated planes, lost stamps, or animation storms. Incoming activity must not replace an open message, reset an in-progress draft, or steal focus.

## Desktop, mobile, and accessibility

The full loop must work with a mouse and ordinary buttons on a laptop, with keyboard controls alone, and with touch on a phone. Desktop is an interactive client, not merely the original's spectator screen. Use responsive layouts at 390px, 768px, and 1440px with no horizontal overflow. Accommodate the mobile software keyboard and safe-area insets.

Provide visible focus, accessible names, labelled fields, inline validation, modal focus restoration, and Escape-to-close where appropriate. Do not capture typing keystrokes as global shortcuts. Respect reduced motion, avoid flashing, and keep sound off until explicitly enabled. Sound can be a small folding, throwing, or catching cue; it must not be required to understand success.

Use adaptive rendering quality, a bounded number of displayed planes, and efficient rendering for the flying flock. Pause decorative work in background tabs. Avoid allocating full-resolution text textures for every distant plane. If WebGL is unavailable, provide a simple paper-based 2D view with real create/catch/read/stamp/release operations. Retain a server-rendered reading and form-based interaction fallback with JavaScript disabled, following the repo's progressive-enhancement principle.

## Crit 10: identifiable actions and useful logs

Give each anonymous browser a stable, non-secret public handle that can be matched between the page and logs. Existing seal machinery can be reused, with enough collision-resistant differentiation; do not use one of the six plane colours as identity. Show the visitor's own handle quietly and attribute messages/stamps where appropriate. Do not expose a roster of viewers or secret cookie tokens.

Emit structured server-side stdout events for visitor issuance, plane creation, catch, stamp/relaunch, unstamped release, lease expiration, stream open/close, and validation/permission refusals. Include timestamp, request/event ID, action, outcome, public actor handle, plane ID when applicable, and a concise reason for failures. Record committed mutations after success. Never log message bodies, raw tokens, cookies, full IP addresses, or unvalidated request payloads.

Document who may read and change each resource and where the server enforces the rule. Demonstrate two separate browser profiles creating and exchanging planes, and verify that `flyctl logs -a comp4020-riff8-yunlin-1` lets an observer distinguish who created, caught, stamped, and released each plane without operating the UI.

## Acceptance and delivery

1. Visually compare the result against Paper Planes: the immersive pastel globe, folded geometry, flying scene, close-up paper, and transitions should be recognisably faithful. Do not stop at a generic themed form.
2. On desktop, create a Blue plane with a multiline Chinese/English/emoji message and an Australia region stamp. In an independent browser, catch that exact plane, read the same text **on its surface**, unfold it, add a Japan stamp, and send it onward. In the first browser, see the added stamp and route with the original text and colour unchanged.
3. Verify all six colours, manual region selection without location permission, long-message layout, empty/invalid submissions, keyboard operation, mobile sizing, reduced motion, and the rendering fallback.
4. Test two simultaneous catches, forged author/lease requests, duplicate launch/release requests, abandoned leases, and reconnect/restart persistence. Prove that a catcher cannot modify another person's original message or earlier stamps.
5. Check logs across independent cookie jars: correct public actors and plane IDs, clear refused actions, and no credentials or message bodies. Use focused automated tests for these shared-state and permission boundaries, plus browser checks for the visual loop.
6. Run the repository's required checks, including `pnpm check`, retain the general invariant tests, and explain any replacement of obsolete painting-specific tests. Update README with the new behaviour, permissions, setup, rendering fallback, reference attribution, and known limitations.
7. Deploy only `comp4020-riff8-yunlin-1` through the existing deployment workflow. Verify the live two-browser exchange and logs, then report the production URL and actual verification results. Follow the top pod block's instruction to delete `prompt.md` in the implementation run's final commit.

Prioritise the complete, persistent, multi-user paper-plane loop and visible written messages first; polish the reference's visual fidelity around that working interaction. Finish with a usable application, not an implementation proposal.
