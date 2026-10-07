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
    return seal;
  }

  function showLooking(n) {
    if (!lookingText) return;
    lookingText.textContent = n <= 1 ? "only you are looking now" : `${n} people looking now`;
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
        body: new URLSearchParams({ body: textarea.value }).toString(),
      });
      const payload = await res.json();
      if (!res.ok) {
        showError(payload.message);
        return;
      }
      showError("");
      textarea.value = "";
      textarea.dispatchEvent(new Event("input"));
      const li = addColophon(payload) ?? document.getElementById(`c-${payload.id}`);
      addSeal(payload);
      li?.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
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
    link.addEventListener("click", () => {
      opener = null;
      popover.hidePopover();
      const target = document.getElementById(href.slice(1));
      if (target) {
        target.tabIndex = -1;
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
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
        const li = document.getElementById(`c-${seal.dataset.id}`);
        if (!li) return;
        e.preventDefault();
        openPopover(
          seal,
          "The colophon behind this seal",
          [
            ["seal-popover-body", li.querySelector(".colophon-body").textContent],
            ["seal-popover-date", li.querySelector(".colophon-date").textContent],
          ],
          `#c-${seal.dataset.id}`,
          "Find it in the list",
        );
      } else if (marker) {
        const li = document.getElementById(`detail-${marker.dataset.detail}`);
        if (!li) return;
        e.preventDefault();
        const title = li.querySelector("strong").textContent.replace(/\.$/, "");
        const text = li.textContent.replace(/^\s*\d+\s*/, "").replace(li.querySelector("strong").textContent, "").trim();
        openPopover(marker, title, [["seal-popover-body", text]], `#detail-${marker.dataset.detail}`, "Read it below");
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

  // ---- carving a seal --------------------------------------------------------

  // Tracing, never free drawing: the chosen character's small-seal form sits
  // faintly under the pad, and the server only accepts a seal that follows it.
  const carve = document.querySelector("details.carve");
  const tool = carve?.querySelector(".carve-tool");
  if (carve && tool) {
    carve.querySelector(".carve-nojs").hidden = true;
    tool.hidden = false;

    const pad = tool.querySelector(".carve-pad");
    const guidePath = tool.querySelector(".carve-guide");
    const inkLayer = tool.querySelector(".carve-ink");
    const status = tool.querySelector(".carve-status");
    const LIMITS = { strokes: 24, perStroke: 300, total: 1500 };
    const SVG = "http://www.w3.org/2000/svg";
    let guides = null;
    let strokes = [];
    let active = null; // { id, points, path }

    const chosen = () => tool.querySelector('input[name="carve-char"]:checked')?.value;
    const style = () => tool.querySelector('input[name="carve-style"]:checked')?.value ?? "zhu";
    const total = () => strokes.reduce((n, s) => n + s.length, 0);
    const say = (text) => (status.textContent = text);

    async function loadGuides() {
      if (guides) return;
      const res = await fetch("/public/guides/guides.json");
      guides = await res.json();
      showGuide();
    }

    function showGuide() {
      if (guides) guidePath.setAttribute("d", guides[chosen()]?.path ?? "");
    }

    function clearInk() {
      strokes = [];
      active = null;
      inkLayer.replaceChildren();
    }

    carve.addEventListener("toggle", () => {
      if (carve.open) loadGuides().catch(() => say("The guides didn't load. Try again in a moment."));
    });
    if (carve.open) loadGuides();

    tool.querySelector(".carve-chars").addEventListener("change", () => {
      clearInk();
      showGuide();
      say("");
    });

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

    function showOwnSeal(mark) {
      for (const el of document.querySelectorAll(".desk-preview .colophon-seal, .footer-seal")) el.innerHTML = mark;
    }

    async function post(payload) {
      const res = await fetch("/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
    }

    tool.addEventListener("click", async (e) => {
      const action = e.target.closest("button[data-carve]")?.dataset.carve;
      if (!action) return;
      if (action === "restart") {
        clearInk();
        say("");
      } else if (action === "save") {
        if (strokes.length === 0) {
          say("Trace the guide first.");
          return;
        }
        say("Checking it against the guide…");
        const res = await post({ char: chosen(), style: style(), strokes });
        if (!res.ok) {
          say(res.body.message ?? "That seal didn't save. Try again.");
          return;
        }
        showOwnSeal(res.body.mark);
        carve.dataset.state = "draft";
        say("Your seal is ready. It goes beside your next line, and can't be changed after that.");
      } else if (action === "generated") {
        const res = await post({ clear: true });
        if (!res.ok) {
          say(res.body.message ?? "That didn't work. Try again.");
          return;
        }
        showOwnSeal(res.body.mark);
        carve.dataset.state = "none";
        clearInk();
        say("You'll write with the seal chosen for your browser.");
      }
    });

    // Once a line carries a carved seal, it's fixed.
    document.addEventListener("colophon:written", () => {
      if (carve.dataset.state !== "draft") return;
      const note = document.createElement("p");
      note.className = "carve-note";
      note.textContent = "Your carved seal is on the scroll now, and fixed, like everything else here.";
      carve.replaceWith(note);
    });
  }
})();
