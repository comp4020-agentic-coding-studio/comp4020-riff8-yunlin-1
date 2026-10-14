import { expect, inject, it } from "vitest";

// A crafted request can skip the form's own maxlength="320" the same way
// spec/colophon.test.ts already posts straight to /colophons, bypassing every
// constraint the <textarea> enforces (see ../memory/MEMORY.md's write-endpoint
// lesson from an earlier crit). Before the fix this test guards, the server
// read an entire oversized body into memory before ever checking its length —
// a single request could exhaust the process's memory on this app's
// single-machine deploy. It has to reject early, not just reject eventually.
const baseUrl = inject("baseUrl");

it("an oversized request body is rejected, not fully buffered", async () => {
  const oversized = "x".repeat(5 * 1024 * 1024); // far past MAX_BODY_LENGTH (320)
  const res = await fetch(new URL("/colophons", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `body=${oversized}`,
  });
  expect(res.status).toBe(413);
});

it("the server still answers normal requests right after an oversized one", async () => {
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
});

// A client that promises a body and hangs up halfway makes the body read
// reject; without one error boundary around the handler that rejection went
// unhandled, and Node exits on one, taking the scroll down for everyone.
it("a client hanging up mid-body doesn't take the server down", async () => {
  const { connect } = await import("node:net");
  const url = new URL(baseUrl);
  await new Promise<void>((resolve) => {
    const socket = connect(Number(url.port || 80), url.hostname, () => {
      socket.write(
        "POST /colophons HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 200\r\n\r\nbody=half",
      );
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 100);
    });
  });
  await new Promise((r) => setTimeout(r, 300));
  expect((await fetch(new URL("/", baseUrl))).status).toBe(200);
});
