import test from "node:test";
import assert from "node:assert/strict";
import { subscribeLiveUpdates } from "../src/services/liveUpdates.js";

test("the authenticated stream reacts to a generic change and stops cleanly", async (context) => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => "test-session-token" };
  context.after(() => { globalThis.localStorage = previousStorage; });
  const browser = new EventTarget();
  browser.navigator = { onLine: true };
  const page = new EventTarget();
  page.visibilityState = "visible";
  let calls = 0;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(": conectado\n\nevent: change\ndata: {}\n\n"));
    controller.close();
  } });
  const stop = subscribeLiveUpdates(() => { calls += 1; }, {
    windowObject: browser, documentObject: page,
    fetchFn: async (url, options) => {
      assert.equal(url, "/api/live/stream");
      assert.equal(options.headers.Authorization, "Bearer test-session-token");
      return { ok: true, body: stream };
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  stop();
  browser.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
});
