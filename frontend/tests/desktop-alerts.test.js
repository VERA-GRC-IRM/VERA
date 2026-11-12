import test from "node:test";
import assert from "node:assert/strict";
import { desktopAlertsEnabled, enableDesktopAlerts, newlyUnreadNotifications, setDesktopAlertsEnabled } from "../src/services/desktopAlerts.js";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value)
};
globalThis.window = new EventTarget();
globalThis.Notification = { permission: "default", requestPermission: async () => "granted" };

test("los avisos requieren consentimiento y se guardan por cuenta", async () => {
  assert.equal(desktopAlertsEnabled("A"), false);
  await enableDesktopAlerts("A");
  Notification.permission = "granted";
  assert.equal(desktopAlertsEnabled("A"), true);
  assert.equal(desktopAlertsEnabled("B"), false);
  setDesktopAlertsEnabled("A", false);
  assert.equal(desktopAlertsEnabled("A"), false);
});

test("solo los avisos nuevos y sin leer son candidatos; la primera consulta establece la base", () => {
  const baseline = new Set(["old", "read"]);
  const entries = [
    { id: "old", readAt: null },
    { id: "read", readAt: "2026-11-11T00:00:00Z" },
    { id: "new", readAt: null },
    { id: "new-read", readAt: "2026-11-11T00:00:00Z" }
  ];
  assert.deepEqual(newlyUnreadNotifications(baseline, entries).map((item) => item.id), ["new"]);
});
