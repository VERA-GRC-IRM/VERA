export const DATA_CHANGE_KEY = "vera:data-updated";
export const DATA_CHANGE_EVENT = "vera:data-change";

export const notifyDataChanged = () => {
  // Solo se comunica que hubo un cambio; los datos se vuelven a pedir al servidor con el token actual.
  try { localStorage.setItem(DATA_CHANGE_KEY, String(Date.now())); } catch { /* El mismo tab sigue funcionando. */ }
  window.dispatchEvent(new Event(DATA_CHANGE_EVENT));
};

export const subscribeAutomaticRefresh = (refresh, {
  windowObject = window,
  documentObject = document,
  now = Date.now,
  intervalMs = 40000,
  minGapMs = 5000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) => {
  let inFlight = false;
  let lastRun = now();
  const run = () => {
    if (inFlight || documentObject.visibilityState === "hidden" || !windowObject.navigator.onLine) return;
    const time = now();
    if (time - lastRun < minGapMs) return;
    lastRun = time;
    inFlight = true;
    Promise.resolve().then(refresh).catch(() => {}).finally(() => { inFlight = false; });
  };
  const onStorage = (event) => { if (event.key === DATA_CHANGE_KEY) run(); };
  const onVisibility = () => { if (documentObject.visibilityState === "visible") run(); };
  windowObject.addEventListener("focus", run);
  windowObject.addEventListener("online", run);
  windowObject.addEventListener(DATA_CHANGE_EVENT, run);
  windowObject.addEventListener("storage", onStorage);
  documentObject.addEventListener("visibilitychange", onVisibility);
  const timer = setIntervalFn(run, intervalMs);
  return () => {
    clearIntervalFn(timer);
    windowObject.removeEventListener("focus", run);
    windowObject.removeEventListener("online", run);
    windowObject.removeEventListener(DATA_CHANGE_EVENT, run);
    windowObject.removeEventListener("storage", onStorage);
    documentObject.removeEventListener("visibilitychange", onVisibility);
  };
};
