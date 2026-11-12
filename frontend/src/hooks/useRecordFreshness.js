import { useEffect, useState } from "react";
import { subscribeLiveUpdates } from "../services/liveUpdates";

// Consulta el servidor, nunca la copia sin conexión, antes de avisar de una edición ajena.
export default function useRecordFreshness(record, collectionPath, field) {
  const [warning, setWarning] = useState(null);
  const key = record?.id ? `${record.id}:${record.storageVersion ?? ""}:${record.updatedAt ?? ""}` : null;
  useEffect(() => {
    if (!record?.id) return undefined;
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch(collectionPath, { cache: "no-store",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        if (!response.ok) return;
        const data = await response.json();
        const latest = data[field]?.find((item) => item.id === record.id);
        const hasVersion = Number.isSafeInteger(record.storageVersion) &&
          Number.isSafeInteger(latest?.storageVersion);
        if (active && (!latest || (hasVersion
          ? latest.storageVersion !== record.storageVersion : latest.updatedAt !== record.updatedAt))) {
          setWarning(key);
        }
      } catch { /* El servidor validará la versión al guardar. */ }
      finally { checking = false; }
    };
    check();
    const timer = window.setInterval(check, 15_000);
    const stopLive = import.meta.env.VITE_VERA_LIVE_UPDATES_ENABLED === "true"
      ? subscribeLiveUpdates(check) : () => {};
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.clearInterval(timer); stopLive(); document.removeEventListener("visibilitychange", check); };
  }, [record?.id, record?.storageVersion, record?.updatedAt, key, collectionPath, field]);
  return Boolean(key && warning === key);
}
