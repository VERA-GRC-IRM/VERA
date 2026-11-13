import test from "node:test";
import assert from "node:assert/strict";
import { DATA_CHANGE_KEY, subscribeAutomaticRefresh } from "../src/services/dataChange.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("actualiza solo una vista visible y conectada, con límite de frecuencia y limpieza", async () => {
  const browser = new EventTarget();
  browser.navigator = { onLine: true };
  const page = new EventTarget();
  page.visibilityState = "visible";
  let time = 10000;
  let timer;
  let stopped = false;
  let count = 0;
  const stop = subscribeAutomaticRefresh(() => { count += 1; }, {
    windowObject: browser, documentObject: page, now: () => time,
    setIntervalFn: (callback) => { timer = callback; return 1; },
    clearIntervalFn: () => { stopped = true; }
  });

  browser.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(count, 0, "el enfoque inicial no duplica la carga de la página");
  time += 6000;
  browser.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(count, 1);
  timer();
  await flush();
  assert.equal(count, 1, "eventos cercanos no disparan consultas repetidas");

  page.visibilityState = "hidden";
  time += 6000;
  timer();
  await flush();
  assert.equal(count, 1);
  page.visibilityState = "visible";
  browser.navigator.onLine = false;
  page.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(count, 1);

  browser.navigator.onLine = true;
  const storageEvent = new Event("storage");
  storageEvent.key = DATA_CHANGE_KEY;
  browser.dispatchEvent(storageEvent);
  await flush();
  assert.equal(count, 2, "un cambio en otra pestaña consulta datos autorizados de nuevo");
  stop();
  assert.equal(stopped, true);
  time += 6000;
  browser.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(count, 2, "desmontar la página retira sus escuchas");
});
