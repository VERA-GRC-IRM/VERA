import { useEffect, useRef } from "react";
import { subscribeAutomaticRefresh } from "../services/dataChange";

export default function useAutomaticRefresh(refresh, enabled = true) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeAutomaticRefresh(() => refreshRef.current());
  }, [enabled]);
}
