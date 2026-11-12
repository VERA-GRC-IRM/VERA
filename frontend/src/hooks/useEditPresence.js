import { useEffect, useState } from "react";

const request = async (path, options = {}) => {
  const response = await fetch(`/api/live/presence${path}`, { cache: "no-store", ...options,
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Presencia no disponible.");
  return response.status === 204 ? null : response.json();
};

export default function useEditPresence(type, recordId) {
  const [snapshot, setSnapshot] = useState({ key: null, editors: [] });
  const key = recordId ? `${type}:${recordId}` : null;
  useEffect(() => {
    if (import.meta.env.VITE_VERA_PRESENCE_ENABLED !== "true" || !recordId) return undefined;
    const clientId = crypto.randomUUID();
    let active = true;
    const body = JSON.stringify({ type, recordId, clientId });
    const heartbeat = () => {
      if (!active || !navigator.onLine || document.visibilityState === "hidden") return;
      request("", { method: "POST", body }).catch(() => {});
    };
    const refresh = () => {
      if (!active || !navigator.onLine || document.visibilityState === "hidden") return;
      request(`?type=${encodeURIComponent(type)}&recordId=${encodeURIComponent(recordId)}`)
        .then((data) => { if (active) setSnapshot({ key, editors: data.editors || [] }); })
        .catch(() => { if (active) setSnapshot({ key, editors: [] }); });
    };
    heartbeat();
    refresh();
    const heartbeatTimer = window.setInterval(heartbeat, 12_000);
    const refreshTimer = window.setInterval(refresh, 8_000);
    const visibility = () => { if (document.visibilityState === "visible") { heartbeat(); refresh(); } };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", visibility);
      request(`/${clientId}`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [type, recordId, key]);
  return snapshot.key === key ? snapshot.editors : [];
}
