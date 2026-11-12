import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getNotifications } from "../services/notificationService";
import { DESKTOP_ALERT_PREFERENCE_EVENT, desktopAlertsEnabled, newlyUnreadNotifications } from "../services/desktopAlerts";
import { DATA_CHANGE_EVENT } from "../services/dataChange";

const accountId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return localStorage.getItem("token") && !user?.roleTour ? user?.id : null;
  } catch { return null; }
};

export default function DesktopAlerts() {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = accountId();
  const [enabled, setEnabled] = useState(() => desktopAlertsEnabled(userId));
  const seen = useRef(null);
  const seenAccount = useRef(null);
  useEffect(() => {
    const sync = () => setEnabled(desktopAlertsEnabled(userId));
    const onStorage = (event) => { if (event.key?.startsWith("vera:desktop-alerts:")) sync(); };
    window.addEventListener(DESKTOP_ALERT_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    sync();
    return () => { window.removeEventListener(DESKTOP_ALERT_PREFERENCE_EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, [userId, location.pathname]);

  useEffect(() => {
    if (!userId || !enabled) { seen.current = null; return undefined; }
    if (seenAccount.current !== userId) { seen.current = null; seenAccount.current = userId; }
    let active = true;
    let pending = false;
    const poll = async () => {
      if (pending || !navigator.onLine || Notification.permission !== "granted") return;
      pending = true;
      try {
        const data = await getNotifications();
        if (!active) return;
        const entries = data.notifications || [];
        if (seen.current) {
          const fresh = newlyUnreadNotifications(seen.current, entries);
          if (fresh.length) {
            const notice = new Notification("VERA · nuevas actividades", {
              body: "Hay actividades nuevas para revisar en tu cuenta.", tag: `vera-activities-${userId}`
            });
            notice.onclick = () => { window.focus(); navigate("/notificaciones"); notice.close(); };
          }
        }
        seen.current = new Set(entries.map((item) => String(item.id)));
      } catch { /* El aviso es opcional; la bandeja conserva sus propios errores y controles. */ }
      finally { pending = false; }
    };
    poll();
    const timer = setInterval(poll, 60000);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    window.addEventListener(DATA_CHANGE_EVENT, poll);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      window.removeEventListener(DATA_CHANGE_EVENT, poll);
    };
  }, [userId, enabled, navigate]);
  return null;
}
