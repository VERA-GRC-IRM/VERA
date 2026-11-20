import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_WINDOW_MS, isActivityWithinWindow } from "../src/utils/activityWindow.js";

const cutoff = Date.parse("2026-11-12T12:00:00.000Z");

test("la vista admite eventos dentro de los siete días, incluidos sus límites", () => {
  assert.equal(isActivityWithinWindow(new Date(cutoff).toISOString(), cutoff), true);
  assert.equal(isActivityWithinWindow(new Date(cutoff + ACTIVITY_WINDOW_MS).toISOString(), cutoff), true);
});

test("la vista excluye eventos anteriores, futuros o con fecha inválida", () => {
  assert.equal(isActivityWithinWindow(new Date(cutoff - 1).toISOString(), cutoff), false);
  assert.equal(isActivityWithinWindow(new Date(cutoff + ACTIVITY_WINDOW_MS + 1).toISOString(), cutoff), false);
  assert.equal(isActivityWithinWindow("sin-fecha", cutoff), false);
});
