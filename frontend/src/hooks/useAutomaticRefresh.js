import { useEffect, useRef } from "react";
import { subscribeAutomaticRefresh } from "../services/dataChange";
import { subscribeLiveUpdates } from "../services/liveUpdates";

export default function useAutomaticRefresh(refresh, enabled = true) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeAutomaticRefresh(() => refreshRef.current());
  }, [enabled]);
  useEffect(() => {
    if (!enabled || import.meta.env.VITE_VERA_LIVE_UPDATES_ENABLED !== "true") return undefined;
    return subscribeLiveUpdates(() => refreshRef.current());
  }, [enabled]);
}
