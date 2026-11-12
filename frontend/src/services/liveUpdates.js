export const subscribeLiveUpdates = (onChange, {
  windowObject = window, documentObject = document,
  fetchFn = fetch, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout
} = {}) => {
  let stopped = false;
  let controller = null;
  let retry = null;
  let connecting = false;
  let delay = 1000;
  let lastSignal = 0;
  const available = () => !stopped && windowObject.navigator.onLine &&
    documentObject.visibilityState !== "hidden";
  const schedule = () => {
    if (!available() || retry !== null || connecting) return;
    retry = setTimeoutFn(() => { retry = null; connect(); }, delay);
    delay = Math.min(delay * 2, 10_000);
  };
  const connect = async () => {
    if (!available() || connecting) return;
    connecting = true;
    controller = new AbortController();
    try {
      const response = await fetchFn("/api/live/stream", { cache: "no-store",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Canal de actualización no disponible.");
      delay = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "";
      while (available()) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trimEnd();
          buffer = buffer.slice(newline + 1);
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (!line) {
            if (event === "change" && Date.now() - lastSignal >= 500) {
              lastSignal = Date.now();
              Promise.resolve().then(onChange).catch(() => {});
            }
            event = "";
          }
          newline = buffer.indexOf("\n");
        }
      }
      await reader.cancel().catch(() => {});
    } catch { /* La consulta periódica permanece activa. */ }
    finally {
      controller = null;
      connecting = false;
      schedule();
    }
  };
  const wake = () => {
    if (!available()) { controller?.abort(); return; }
    delay = 1000;
    if (retry !== null) { clearTimeoutFn(retry); retry = null; }
    connect();
  };
  windowObject.addEventListener("online", wake);
  windowObject.addEventListener("offline", wake);
  documentObject.addEventListener("visibilitychange", wake);
  connect();
  return () => {
    stopped = true;
    controller?.abort();
    if (retry !== null) clearTimeoutFn(retry);
    windowObject.removeEventListener("online", wake);
    windowObject.removeEventListener("offline", wake);
    documentObject.removeEventListener("visibilitychange", wake);
  };
};
