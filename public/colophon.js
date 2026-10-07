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
      li?.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      document.dispatchEvent(new CustomEvent("colophon:written", { detail: { event: payload, li } }));
    } catch {
      showError("That didn't reach the scroll. Check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  });
})();
