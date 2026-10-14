import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";
import { marker, newVisitor, write } from "./sse.ts";

// The right-hand panel: three sections down the page without a script, ARIA
// tabs with one (arrow keys, Home, End), and the URL hash opens the tab that
// holds its target. Checked against the page and script the app serves.
const baseUrl = inject("baseUrl");

class FakeEventSource {
  static CLOSED = 2;
  readyState = 0;
  addEventListener(): void {}
  close(): void {}
}

async function page(hash = ""): Promise<JSDOM> {
  const cookie = await newVisitor();
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const script = await (await fetch(new URL("/public/colophon.js", baseUrl))).text();
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/, ""), {
    url: new URL(`/${hash}`, baseUrl).href,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window as unknown as Record<string, unknown>;
  w.EventSource = FakeEventSource;
  w.matchMedia = () => ({ matches: true, addEventListener() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(script);
  return dom;
}

it("without a script, the three panels are plain sections and the tab bar stays hidden", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const doc = new JSDOM(html).window.document;
  expect(doc.querySelector('[role="tablist"]')!.hasAttribute("hidden")).toBe(true);
  for (const id of ["about", "mark", "colophons"]) {
    const section = doc.getElementById(id)!;
    expect(section.tagName).toBe("SECTION");
    expect(section.hasAttribute("hidden")).toBe(false);
  }
  expect(doc.querySelector("#mark form.desk")!.getAttribute("method")).toBe("post");
  // A list of free spots, or (once they have all gone) a note saying so.
  expect(doc.querySelector("#mark select#spot") ?? doc.querySelector("#mark .step-spot .step-note")).toBeTruthy();
});

it("with the script, they're ARIA tabs that the keyboard moves between", async () => {
  const dom = await page();
  const doc = dom.window.document;
  const tabs = [...doc.querySelectorAll('[role="tab"]')] as HTMLElement[];
  expect(doc.querySelector('[role="tablist"]')!.hasAttribute("hidden")).toBe(false);
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
  for (const t of tabs) {
    const panel = doc.getElementById(t.getAttribute("aria-controls")!)!;
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(t.id);
  }
  expect(doc.getElementById("mark")!.hidden).toBe(true);

  const key = (k: string) =>
    doc.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  tabs[0]!.focus();
  key("ArrowRight");
  expect(doc.activeElement).toBe(tabs[1]);
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
  expect(tabs[1]!.tabIndex).toBe(0);
  expect(tabs[0]!.tabIndex).toBe(-1);
  expect(doc.getElementById("mark")!.hidden).toBe(false);
  expect(doc.getElementById("about")!.hidden).toBe(true);
  key("End");
  expect(doc.activeElement).toBe(tabs[2]);
  key("ArrowRight");
  expect(doc.activeElement).toBe(tabs[0]);
  key("ArrowLeft");
  expect(doc.activeElement).toBe(tabs[2]);
  key("Home");
  expect(doc.activeElement).toBe(tabs[0]);
});

it("the hash opens the tab holding its target: #mark, a colophon, a detail", async () => {
  const res = await write(marker("hash-target"));
  const id = res.headers.get("location")!.slice(2);
  const selected = (dom: JSDOM) => dom.window.document.querySelector('[aria-selected="true"]')!.id;
  expect(selected(await page("#mark"))).toBe("tab-mark");
  expect(selected(await page(`#${id}`))).toBe("tab-colophons");
  expect(selected(await page("#detail-pine"))).toBe("tab-about");
  expect(selected(await page("#nothing-here"))).toBe("tab-about");
});

it("the free spots on the painting show only while making a mark", async () => {
  const dom = await page();
  const doc = dom.window.document;
  const layer = doc.querySelector(".painting-spots") as HTMLElement;
  expect(layer.hidden).toBe(true);
  (doc.getElementById("tab-mark") as HTMLElement).click();
  expect(layer.hidden).toBe(false);
  (doc.getElementById("tab-colophons") as HTMLElement).click();
  expect(layer.hidden).toBe(true);
});
