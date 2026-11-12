const keyFor = (userId) => `vera:desktop-alerts:${userId}`;
export const DESKTOP_ALERT_PREFERENCE_EVENT = "vera:desktop-alert-preference";

export const desktopAlertsAvailable = () => typeof Notification !== "undefined" &&
  typeof Notification.requestPermission === "function";

export const desktopAlertsEnabled = (userId) => {
  if (!userId || !desktopAlertsAvailable() || Notification.permission !== "granted") return false;
  try { return localStorage.getItem(keyFor(userId)) === "1"; } catch { return false; }
};

export const setDesktopAlertsEnabled = (userId, enabled) => {
  if (!userId) return;
  localStorage.setItem(keyFor(userId), enabled ? "1" : "0");
  window.dispatchEvent(new Event(DESKTOP_ALERT_PREFERENCE_EVENT));
};

export const enableDesktopAlerts = async (userId) => {
  if (!userId || !desktopAlertsAvailable()) throw new Error("Este navegador no admite avisos de escritorio.");
  const permission = Notification.permission === "granted"
    ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("El navegador no concedió permiso para avisos.");
  setDesktopAlertsEnabled(userId, true);
};

export const newlyUnreadNotifications = (previousIds, notifications) =>
  notifications.filter((item) => !item.readAt && !previousIds.has(String(item.id)));
