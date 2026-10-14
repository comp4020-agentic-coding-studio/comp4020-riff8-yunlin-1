// Progressive enhancement for Colophon. Without this script the page still
// reads, and the form still posts and redirects; with it, new lines arrive
// live, the 過眼 count moves, and writing stays on the page.
(() => {
  "use strict";

  const list = document.querySelector(".colophon-list");
  const form = document.querySelector("form.desk");
  if (!list || !form) return;

  const textarea = form.querySelector("textarea");
  const errorBox = document.querySelector(".form-error");
  const lookingText = document.querySelector(".guoyan-text");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Highest colophon id on this page: where a fresh stream starts replaying.
  let lastId = Number(list.dataset.lastId) || 0;

  function fromHtml(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // These lines were seen, live, so a return visit shouldn't call them new.
  function rememberSeen() {
    document.cookie = `seen=${lastId}; Max-Age=315360000; Path=/; SameSite=Lax`;
  }

  // Adds a colophon at the end of the list (oldest first, the way a scroll
  // unrolls), once: an id already on the page is ignored. Appending below
  // never moves what the reader is looking at.
  // Someone else's line spreads in like ink; your own is stamped.
  function addColophon(event) {
    if (document.getElementById(`c-${event.id}`)) return null;
    const li = fromHtml(event.html);
    if (!reduceMotion.matches) li.classList.add(li.classList.contains("colophon--mine") ? "stamped" : "arriving");
    list.append(li);
    document.querySelector(".empty-note")?.remove();
    if (event.id > lastId) {
      lastId = event.id;
      rememberSeen();
    }
    return li;
  }

  // Its seal goes onto the painting at the same moment, where the server put it.
  const sealLayer = document.querySelector(".painting-seals");
  function addSeal(event) {
    if (!event.seal || !sealLayer || sealLayer.querySelector(`[data-id="${event.id}"]`)) return null;
    const seal = fromHtml(event.seal);
    if (!reduceMotion.matches) seal.classList.add(seal.classList.contains("painting-seal--mine") ? "stamped" : "arriving");
    sealLayer.append(seal);
    document.dispatchEvent(new CustomEvent("spot:taken", { detail: Number(seal.dataset.spot) }));
    return seal;
  }

  function showLooking(n) {
    if (!lookingText) return;
    lookingText.textContent = n <= 1 ? "only you are looking now" : `${n} people looking now`;
  }

  // ---- tabs: about, make your mark, colophons ------------------------------

  // Without a script the three are sections down the page. With one they're
  // tabs (the ARIA tabs pattern: arrow keys, Home and End move between them),
  // and the URL hash opens the right one: #mark, #colophons, #c-42, #detail-pine.
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = tablist ? [...tablist.querySelectorAll('[role="tab"]')] : [];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));

  function select(tab, { focus = false } = {}) {
    tabs.forEach((t, i) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tab.focus();
    document.body.classList.toggle("choosing-spot", tab.id === "tab-mark");
    const spots = document.querySelector(".painting-spots");
    if (spots) spots.hidden = tab.id !== "tab-mark";
  }

  // Opens whichever tab holds the element with this id, and brings it into view.
  function reveal(id, focus) {
    const target = document.getElementById(id);
    if (!target) return false;
    const panel = target.closest(".tab-panel");
    const tab = panel && tabs.find((t) => t.getAttribute("aria-controls") === panel.id);
    if (tab) select(tab);
    history.replaceState(null, "", `#${id}`);
    if (target !== panel) {
      target.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      if (focus) {
        target.tabIndex = -1;
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
    }
    return true;
  }

  if (tablist) {
    tablist.hidden = false;
    document.body.classList.add("tabs-on");
    panels.forEach((p, i) => {
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-labelledby", tabs[i].id);
      p.tabIndex = 0;
    });
    tablist.addEventListener("click", (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (!tab) return;
      select(tab);
      history.replaceState(null, "", `#${tab.getAttribute("aria-controls")}`);
    });
    tablist.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const tab = tabs[(next + tabs.length) % tabs.length];
      select(tab, { focus: true });
      history.replaceState(null, "", `#${tab.getAttribute("aria-controls")}`);
    });
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id || !reveal(id, false)) select(tabs[0]);
    };
    addEventListener("hashchange", fromHash);
    // A write refused without a script comes back as the page, on its error.
    if (errorBox && !errorBox.hidden) reveal("mark", false);
    else fromHash();
  }

  // ---- the live stream ----------------------------------------------------

  let source = null;
  let retryTimer = 0;

  function connect() {
    clearTimeout(retryTimer);
    source = new EventSource(`/events?after=${lastId}`);
    source.addEventListener("colophon", (e) => {
      const event = JSON.parse(e.data);
      const li = addColophon(event);
      addSeal(event);
      if (li) document.dispatchEvent(new CustomEvent("colophon:arrived", { detail: { event, li } }));
    });
    source.addEventListener("presence", (e) => showLooking(Number(e.data)));
    // The browser reconnects by itself (with Last-Event-ID) after a dropped
    // connection; it gives up only on a refusal such as a 503, so try again
    // from the highest id held, a little later.
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) retryTimer = setTimeout(connect, 15000);
    });
  }

  // The back-forward cache keeps a page's EventSource open after navigating
  // away, which would count a departed visitor as still looking.
  addEventListener("pagehide", () => {
    clearTimeout(retryTimer);
    source?.close();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) connect();
  });

  connect();

  // ---- writing --------------------------------------------------------------

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      const payload = await res.json();
      if (!res.ok) {
        showError(payload.message);
        if (payload.freeSpots) document.dispatchEvent(new CustomEvent("spots:free", { detail: payload.freeSpots }));
        return;
      }
      showError("");
      textarea.value = "";
      textarea.dispatchEvent(new Event("input"));
      const li = addColophon(payload) ?? document.getElementById(`c-${payload.id}`);
      addSeal(payload);
      // Show the line where it landed, among the others.
      if (li && !reveal(li.id, true)) li.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      document.dispatchEvent(new CustomEvent("colophon:written", { detail: { event: payload, li } }));
    } catch {
      showError("That didn't reach the scroll. Check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  });

  // ---- popovers: a seal's line, a detail's note ----------------------------

  // Without a script a seal or a detail marker is a link down the page; with
  // one, tapping it shows the same words in place, with that link kept.
  const popover = document.createElement("div");
  popover.className = "seal-popover";
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  document.body.append(popover);
  const canPop = "showPopover" in popover;
  let opener = null;
  // Closing it (Escape, or a tap elsewhere) hands focus back to what opened it.
  popover.addEventListener("toggle", (e) => {
    if (e.newState === "closed" && opener && (popover.contains(document.activeElement) || document.activeElement === document.body)) {
      opener.focus({ preventScroll: true });
    }
  });

  function openPopover(anchor, label, parts, href, linkText) {
    opener = anchor;
    popover.replaceChildren();
    popover.setAttribute("aria-label", label);
    for (const [cls, text] of parts) {
      const p = document.createElement("p");
      p.className = cls;
      p.textContent = text;
      popover.append(p);
    }
    const link = document.createElement("a");
    link.href = href;
    link.textContent = linkText;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      opener = null;
      popover.hidePopover();
      reveal(href.slice(1), true);
    });
    popover.append(link);
    popover.showPopover();
    const r = anchor.getBoundingClientRect();
    const w = popover.offsetWidth;
    const h = popover.offsetHeight;
    popover.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)}px`;
    popover.style.top = `${r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
    link.focus();
  }

  const canvas = document.querySelector(".scroll-canvas");
  if (canvas && canPop) {
    canvas.addEventListener("click", (e) => {
      const seal = e.target.closest(".painting-seal");
      const marker = e.target.closest(".detail-marker");
      if (seal) {
        if (!document.getElementById(`c-${seal.dataset.id}`)) return;
        e.preventDefault();
        reveal(`c-${seal.dataset.id}`, true);
      } else if (marker) {
        const li = document.getElementById(`detail-${marker.dataset.detail}`);
        if (!li) return;
        e.preventDefault();
        const title = li.querySelector("strong").textContent.replace(/\.$/, "");
        const text = li.textContent.replace(/^\s*\d+\s*/, "").replace(li.querySelector("strong").textContent, "").trim();
        openPopover(marker, title, [["seal-popover-body", text]], `#detail-${marker.dataset.detail}`, "Read it in About this painting");
      }
    });
  }

  // ---- getting around the painting --------------------------------------

  const frame = document.querySelector(".scroll-window");
  const scroller = document.querySelector(".scroll-scroller");
  const tools = document.querySelector(".scroll-tools");
  const hint = document.querySelector(".scroll-hint");

  if (frame && scroller && canvas && tools) {
    tools.hidden = false;

    // The hint stays until the reader first scrolls the painting.
    if (hint) {
      hint.hidden = false;
      scroller.addEventListener("scroll", () => hint.classList.add("gone"), { once: true, passive: true });
    }

    // Zoom keeps the point at the centre of the view where it was. The
    // scroller is right-to-left (it opens at the scroll's right end), so its
    // scrollLeft runs from 0 at the right edge to negative at the left.
    const LEVELS = [1, 1.5, 2, 3];
    let level = 0;
    const MAX_HEIGHT = 1200; // twice the scan's pixels, no more

    function baseHeight() {
      return Math.min(scroller.clientHeight, 600);
    }

    function zoomTo(next) {
      const base = baseHeight();
      const allowed = LEVELS.filter((z) => base * z <= MAX_HEIGHT);
      next = Math.max(0, Math.min(next, allowed.length - 1));
      if (next === level) return;
      const fromLeft = scroller.scrollWidth - scroller.clientWidth + scroller.scrollLeft;
      const fx = (fromLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
      const fy = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
      level = next;
      if (LEVELS[level] === 1) {
        canvas.style.height = "";
        scroller.classList.remove("zoomed");
      } else {
        canvas.style.height = `${base * LEVELS[level]}px`;
        scroller.classList.add("zoomed");
      }
      const newLeft = fx * scroller.scrollWidth - scroller.clientWidth / 2;
      scroller.scrollLeft = newLeft - (scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollTop = fy * scroller.scrollHeight - scroller.clientHeight / 2;
      tools.querySelector('[data-zoom="out"]').disabled = level === 0;
      tools.querySelector('[data-zoom="in"]').disabled = level === allowed.length - 1;
    }
    tools.querySelector('[data-zoom="out"]').disabled = true;

    const detailsButton = tools.querySelector('[data-action="details"]');
    const fullButton = tools.querySelector('[data-action="fullscreen"]');
    if (!frame.requestFullscreen) fullButton.hidden = true;

    tools.addEventListener("click", (e) => {
      const button = e.target.closest("button");
      if (!button) return;
      if (button.dataset.zoom) zoomTo(level + (button.dataset.zoom === "in" ? 1 : -1));
      else if (button === detailsButton) {
        const on = frame.classList.toggle("show-details");
        detailsButton.setAttribute("aria-pressed", String(on));
      } else if (button === fullButton) {
        if (document.fullscreenElement) document.exitFullscreen();
        else frame.requestFullscreen();
      }
    });

    document.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement === frame;
      fullButton.setAttribute("aria-pressed", String(on));
      fullButton.textContent = on ? "Leave full screen" : "Full screen";
      // Heights change with the frame, so start the zoom again from 1.
      const was = level;
      level = -1;
      zoomTo(0);
      if (was > 0) zoomTo(was);
    });
  }

  // ---- the desk: counter, preview, a first-time confirmation ---------------

  const MAX = Number(textarea.maxLength) || 320;
  const count = form.querySelector(".desk-count");
  const countVisible = form.querySelector(".desk-count-visible");
  const countSpoken = form.querySelector(".desk-count [aria-live]");
  const preview = form.querySelector(".desk-preview");
  const previewBody = preview?.querySelector(".colophon-body");
  const confirmNote = form.querySelector(".desk-confirm");
  const submitButton = form.querySelector("button[type=submit]");
  let lastSpoken = MAX;

  function updateDesk() {
    const left = MAX - textarea.value.length;
    const word = left === 1 ? "character" : "characters";
    countVisible.textContent = `${left} ${word} left`;
    // Announced politely, and only now and then, not on every keystroke.
    const step = left <= 20 ? 5 : 50;
    if (Math.floor(left / step) !== Math.floor(lastSpoken / step) || left === 0) {
      countSpoken.textContent = `${left} ${word} left`;
      lastSpoken = left;
    }
    if (preview) {
      preview.hidden = textarea.value.trim() === "";
      previewBody.textContent = textarea.value.trim();
    }
    if (confirming) resetConfirm();
  }

  let confirming = false;
  function resetConfirm() {
    confirming = false;
    confirmNote.hidden = true;
    submitButton.textContent = "Write it in";
  }

  if (count) {
    count.hidden = false;
    textarea.addEventListener("input", updateDesk);
    updateDesk();
  }

  // The first time a browser writes, one inline confirmation, never a pop-up.
  form.addEventListener(
    "submit",
    (e) => {
      if (form.dataset.hasWritten === "true" || confirming || textarea.value.trim() === "") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      confirming = true;
      confirmNote.hidden = false;
      submitButton.textContent = "Yes, write it in";
      submitButton.focus();
    },
    { capture: true },
  );
  document.addEventListener("colophon:written", () => {
    form.dataset.hasWritten = "true";
    resetConfirm();
  });

  // ---- making a mark: step 1, the seal ------------------------------------

  // Choosing a seal only changes the previews; nothing is saved until the
  // line is written, except a carving, which is kept (and checked against its
  // guide) when its maker presses "Keep this seal".
  const step = document.querySelector(".step-seal[data-choice]");
  const SVG = "http://www.w3.org/2000/svg";
  let guides = null;
  async function loadGuides() {
    if (!guides) guides = await (await fetch("/public/guides/guides.json")).json();
    return guides;
  }

  function setPreviews(mark, handle) {
    for (const el of document.querySelectorAll(".seal-preview-row .seal-preview, .desk-preview .colophon-seal, .spot-preview > span")) {
      el.innerHTML = mark;
    }
    for (const el of document.querySelectorAll(".choice-handle")) el.textContent = handle;
  }

  function setFooter(mark, handle) {
    const seal = document.querySelector(".footer-seal");
    if (seal) seal.innerHTML = mark;
    for (const el of document.querySelectorAll(".own-handle")) el.textContent = handle;
  }

  if (step) {
    const tag = (document.querySelector(".choice-handle")?.textContent ?? "").split("·")[1] ?? "";
    const generatedGlyph = step.querySelector('.seal-option [lang="zh-Hant"]')?.textContent ?? "";
    const tool = step.querySelector(".carve-tool");
    const status = tool.querySelector(".carve-status");
    const say = (text) => (status.textContent = text);
    const choice = () => step.querySelector('input[name="seal"]:checked')?.value ?? "generated";
    const chosenChar = () => step.querySelector('input[name="char"]:checked')?.value;
    const chosenStyle = () => step.querySelector('input[name="style"]:checked')?.value ?? "zhu";
    // A carving kept earlier (on this page or a previous visit).
    let carved = step.dataset.hasCarved === "true" && step.dataset.choice === "carved"
      ? { mark: step.querySelector(".seal-preview").innerHTML, char: document.querySelector(".choice-handle").textContent.split("·")[0] }
      : null;

    for (const el of step.querySelectorAll("[data-needs-script]")) el.hidden = false;

    // The character as the font draws it: the same outline the server uses.
    function readyMark(char, style) {
      const d = guides?.[char]?.path ?? "";
      const body =
        style === "bai"
          ? `<mask id="cut-c"><rect x="-70" y="-70" width="1140" height="1140" fill="#fff"/><path d="${d}" fill="#000"/></mask><rect x="-62" y="-62" width="1124" height="1124" rx="36" fill="currentColor" mask="url(#cut-c)"/>`
          : `<rect x="-40" y="-40" width="1080" height="1080" rx="40" fill="none" stroke="currentColor" stroke-width="44"/><path d="${d}" fill="currentColor"/>`;
      return `<svg class="carved ready" viewBox="-90 -90 1180 1180" aria-hidden="true" focusable="false">${body}</svg>`;
    }

    async function refresh() {
      const c = choice();
      step.dataset.choice = c;
      tool.hidden = c !== "carved";
      if (c === "generated") {
        setPreviews(generatedGlyph, `${generatedGlyph}·${tag}`);
        return;
      }
      await loadGuides();
      showGuide();
      if (c === "carved" && carved) setPreviews(carved.mark, `${carved.char}·${tag}`);
      else setPreviews(readyMark(chosenChar(), chosenStyle()), `${chosenChar()}·${tag}`);
      if (c === "carved" && !carved) say("Trace the guide, then keep it.");
    }

    step.addEventListener("change", (e) => {
      if (e.target.name === "char") clearInk();
      refresh().catch(() => say("The seal forms didn't load. Try again in a moment."));
    });

    // Carving: tracing, never free drawing. The chosen character's small-seal
    // form sits faintly under the pad, and the server only accepts a seal
    // that follows it.
    const pad = tool.querySelector(".carve-pad");
    const guidePath = tool.querySelector(".carve-guide");
    const inkLayer = tool.querySelector(".carve-ink");
    const LIMITS = { strokes: 24, perStroke: 300, total: 1500 };
    let strokes = [];
    let active = null; // { id, points, path }
    const total = () => strokes.reduce((n, st) => n + st.length, 0);

    function showGuide() {
      if (guides) guidePath.setAttribute("d", guides[chosenChar()]?.path ?? "");
    }

    function clearInk() {
      strokes = [];
      active = null;
      inkLayer.replaceChildren();
    }

    function toGrid(e) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(pad.getScreenCTM().inverse());
      const clamp = (v) => Math.max(0, Math.min(1000, Math.round(v)));
      return [clamp(p.x), clamp(p.y)];
    }

    function draw(stroke) {
      stroke.path.setAttribute("d", stroke.points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("") + (stroke.points.length === 1 ? "l0 0.1" : ""));
    }

    pad.addEventListener("pointerdown", (e) => {
      if (active || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (strokes.length >= LIMITS.strokes || total() >= LIMITS.total) {
        say("That's as many strokes as a seal can hold. Keep it, or start again.");
        return;
      }
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      const path = document.createElementNS(SVG, "path");
      inkLayer.append(path);
      active = { id: e.pointerId, points: [toGrid(e)], path };
      strokes.push(active.points);
      draw(active);
    });

    pad.addEventListener("pointermove", (e) => {
      if (!active || e.pointerId !== active.id) return;
      const pt = toGrid(e);
      const last = active.points.at(-1);
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 8) return;
      if (active.points.length >= LIMITS.perStroke || total() >= LIMITS.total) return;
      active.points.push(pt);
      draw(active);
    });

    // Every way a gesture can end ends the stroke, for this pointer only.
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      pad.addEventListener(type, (e) => {
        if (active && e.pointerId === active.id) active = null;
      });
    }

    tool.addEventListener("click", async (e) => {
      const action = e.target.closest("button[data-carve]")?.dataset.carve;
      if (action === "restart") {
        clearInk();
        say("");
      } else if (action === "save") {
        if (strokes.length === 0) {
          say("Trace the guide first.");
          return;
        }
        say("Checking it against the guide…");
        const res = await fetch("/seal", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ char: chosenChar(), style: chosenStyle(), strokes }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          say(body.message ?? "That seal didn't save. Try again.");
          return;
        }
        carved = { mark: body.mark, char: chosenChar() };
        step.dataset.hasCarved = "true";
        setPreviews(body.mark, body.handle);
        setFooter(body.mark, body.handle);
        say("Your seal is kept. It goes beside your next line, and can't be changed after that.");
      }
    });

    // Once a line carries a chosen seal, it's fixed.
    document.addEventListener("colophon:written", (e) => {
      const li = e.detail.li;
      const mark = li?.querySelector(".colophon-seal")?.innerHTML;
      const handle = li?.querySelector(".handle")?.textContent;
      if (mark && handle) setFooter(mark, handle);
      if (choice() === "generated" || !mark) return;
      const fixed = document.createElement("div");
      fixed.className = "step step-seal";
      fixed.innerHTML = `<h3 class="step-title"><span class="step-num" aria-hidden="true">1</span> Your seal</h3><p class="carve-note"><span class="seal-preview" aria-hidden="true">${mark}</span> Your seal is on the scroll now, and fixed, like everything else here.</p>`;
      step.replaceWith(fixed);
    });

    if (step.dataset.choice !== "generated") refresh().catch(() => {});
  }

  // ---- making a mark: step 2, the spot -----------------------------------

  // The free spots show on the painting while the "Make your mark" tab is
  // open. Clicking one picks it in the list (which is what's posted, and
  // what works without a script); the server checks it again as it writes.
  const spotLayer = document.querySelector(".painting-spots");
  const spotSelect = document.querySelector("#spot");
  const spotPreview = spotLayer?.querySelector(".spot-preview");

  function showSpot() {
    if (!spotLayer || !spotSelect) return;
    const value = spotSelect.value;
    for (const m of spotLayer.querySelectorAll(".spot-marker")) m.setAttribute("aria-pressed", String(m.dataset.spot === value));
    const chosen = spotLayer.querySelector(`.spot-marker[data-spot="${value}"]`);
    spotPreview.hidden = !chosen;
    if (chosen) {
      spotPreview.style.left = chosen.style.left;
      spotPreview.style.top = chosen.style.top;
    }
  }

  function dropSpot(i) {
    spotLayer?.querySelector(`.spot-marker[data-spot="${i}"]`)?.remove();
    const option = spotSelect?.querySelector(`option[value="${i}"]`);
    if (!option) return;
    const wasChosen = option.selected;
    option.remove();
    if (wasChosen) {
      spotSelect.value = "any";
      showError("That spot was just taken. Choose another; your line is still here.");
    }
    showSpot();
  }

  if (spotLayer && spotSelect) {
    document.querySelector(".spot-hint").hidden = false;
    spotSelect.addEventListener("change", showSpot);
    spotLayer.addEventListener("click", (e) => {
      const marker = e.target.closest(".spot-marker");
      if (!marker) return;
      spotSelect.value = marker.dataset.spot;
      showError("");
      showSpot();
    });
    document.addEventListener("spot:taken", (e) => dropSpot(e.detail));
    document.addEventListener("spots:free", (e) => {
      for (const o of [...spotSelect.options]) if (o.value !== "any" && !e.detail.includes(Number(o.value))) dropSpot(o.value);
    });
    document.addEventListener("colophon:written", () => {
      spotSelect.value = "any";
      showSpot();
    });
    showSpot();
  }
})();
