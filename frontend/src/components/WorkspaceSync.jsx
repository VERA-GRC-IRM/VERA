import { useEffect } from "react";
import { readWorkspace, replaceWorkspace } from "../services/personalWorkspace";
import { fetchWorkspace, mergeWorkspace, saveWorkspace } from "../services/workspaceSync";

const enabled = import.meta.env.VITE_VERA_WORKSPACE_SYNC_ENABLED === "true";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasItems = (data) => Object.values(data).some((items) => items.length);

export default function WorkspaceSync() {
  useEffect(() => {
    if (!enabled) return undefined;
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user?.id || user.roleTour || !localStorage.getItem("token")) return undefined;
    const userId = Number(user.id);
    let closed = false;
    let ready = false;
    let initializing = false;
    let busy = false;
    let dirty = false;
    let awaitingImport = null;
    let timer;
    let version = 0;
    let baseline = { favorites: [], views: [], recent: [] };
    const metaKey = `vera:workspace:sync:v1:${userId}`;
    const roleKey = `vera:workspace:role:v1:${userId}`;
    const remember = () => {
      try { localStorage.setItem(metaKey, JSON.stringify({ version, baseline })); } catch { /* Se conserva la copia local. */ }
    };
    const status = (value) => {
      try { sessionStorage.setItem(`vera:workspace:status:${userId}`, value); } catch { /* Estado visual opcional. */ }
      window.dispatchEvent(new CustomEvent("vera:workspace-sync-status",
        { detail: { userId, status: value } }));
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(flush, 650);
    };
    const apply = (row) => {
      version = row.version;
      baseline = row.payload;
      replaceWorkspace(userId, row.payload);
      remember();
      status("synced");
    };
    const flush = async () => {
      if (!ready || busy || closed || !navigator.onLine) return;
      const local = readWorkspace(userId);
      if (same(local, baseline)) { dirty = false; status("synced"); return; }
      busy = true;
      status("syncing");
      try {
        let payload = local;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const saved = await saveWorkspace(version, payload);
            if (closed) return;
            const latest = readWorkspace(userId);
            if (same(latest, payload)) { apply(saved); dirty = false; }
            else {
              const merged = mergeWorkspace(payload, latest, saved.payload);
              version = saved.version;
              baseline = saved.payload;
              remember();
              replaceWorkspace(userId, merged);
              dirty = !same(merged, saved.payload);
              status(dirty ? "pending" : "synced");
              if (dirty) schedule();
            }
            return;
          } catch (error) {
            if (error.status !== 409 || attempt === 2) throw error;
            const remote = await fetchWorkspace();
            payload = mergeWorkspace(baseline, payload, remote.payload);
            if (closed) return;
            if (same(payload, remote.payload)) { apply(remote); dirty = false; return; }
            version = remote.version;
            baseline = remote.payload;
            remember();
          }
        }
      } catch { if (!closed) status("pending"); }
      finally { busy = false; }
    };
    const refresh = async () => {
      if (!ready || busy || closed || !navigator.onLine) return;
      if (dirty || !same(readWorkspace(userId), baseline)) return flush();
      busy = true;
      try {
        const remote = await fetchWorkspace();
        if (!closed && remote.version !== version) apply(remote);
      } catch { if (!closed) status("pending"); }
      finally { busy = false; }
    };
    const initialize = async () => {
      if (initializing || ready || closed || !navigator.onLine) return;
      initializing = true;
      status("syncing");
      try {
        const remote = await fetchWorkspace();
        if (closed) return;
        try {
          const lastRole = localStorage.getItem(roleKey);
          if (lastRole && lastRole !== user.role) {
            localStorage.removeItem(metaKey);
            replaceWorkspace(userId, { favorites: [], views: [], recent: [] });
          }
          localStorage.setItem(roleKey, user.role);
        } catch { /* La validación del servidor sigue siendo obligatoria. */ }
        let previous = null;
        try { previous = JSON.parse(localStorage.getItem(metaKey) || "null"); } catch { /* Primera sincronización. */ }
        const local = readWorkspace(userId);
        const base = previous?.baseline && typeof previous.baseline === "object"
          ? previous.baseline : { favorites: [], views: [], recent: [] };
        const pending = previous ? !same(local, base) : false;
        version = remote.version;
        baseline = remote.payload;
        if (!previous && hasItems(local)) {
          awaitingImport = remote;
          status("import-ready");
          return;
        }
        ready = true;
        if (pending) {
          const merged = mergeWorkspace(base, local, remote.payload);
          if (same(merged, remote.payload)) { apply(remote); dirty = false; }
          else { replaceWorkspace(userId, merged); dirty = true; status("pending"); schedule(); }
        } else { apply(remote); dirty = false; }
      } catch { if (!closed) status("pending"); }
      finally { initializing = false; }
    };
    const changed = (event) => {
      if (event.detail?.userId !== userId || event.detail?.source === "remote") return;
      if (awaitingImport) return;
      dirty = true;
      status("pending");
      schedule();
    };
    const storage = (event) => {
      if (event.key === `vera:workspace:v1:${userId}`) { dirty = true; schedule(); }
    };
    const focus = () => { if (document.visibilityState === "visible") {
      if (ready) refresh(); else if (!awaitingImport) initialize();
    } };
    const choose = (event) => {
      if (event.detail?.userId !== userId || !awaitingImport) return;
      const remote = awaitingImport;
      awaitingImport = null;
      ready = true;
      if (event.detail.action === "remote") { apply(remote); dirty = false; return; }
      const merged = mergeWorkspace({ favorites: [], views: [], recent: [] },
        readWorkspace(userId), remote.payload);
      if (same(merged, remote.payload)) { apply(remote); dirty = false; return; }
      replaceWorkspace(userId, merged);
      dirty = true;
      status("pending");
      schedule();
    };
    const interval = setInterval(focus, 60_000);
    window.addEventListener("vera:workspace-change", changed);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener("vera:workspace-sync-choice", choose);
    document.addEventListener("visibilitychange", focus);
    initialize();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("vera:workspace-change", changed);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener("vera:workspace-sync-choice", choose);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  return null;
}
