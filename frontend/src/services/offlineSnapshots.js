import { readOfflineVault, saveOfflineVault } from "./offlineVault";

export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MODULE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export const SNAPSHOT_MODULES = [
  { id: "dashboard", label: "Panel de Portafolio", path: "/api/dashboard", link: "/dashboard" },
  { id: "planning", label: "Planificación", path: "/api/planning", link: "/planificacion", listKey: "proposals" },
  { id: "activeAudits", label: "Auditorías activas", path: "/api/planning/active", link: "/auditorias-activas", listKey: "audits" },
  { id: "risks", label: "Riesgos", path: "/api/risks/", link: "/riesgos", listKey: "risks" },
  { id: "riskOwners", label: "Responsables autorizados", path: "/api/risks/owners", link: "/riesgos", listKey: "owners" },
  { id: "controls", label: "Controles", path: "/api/controls/", link: "/controles", listKey: "controls" },
  { id: "findings", label: "Hallazgos", path: "/api/findings/", link: "/auditorias-activas", listKey: "findings" },
  { id: "actions", label: "Planes de acción", path: "/api/actions", link: "/dashboard", listKey: "actions" },
  { id: "evidence", label: "Evidencias (metadatos)", path: "/api/evidence/", link: "/evidencias", listKey: "evidence" },
  { id: "notifications", label: "Pendientes", path: "/api/notifications", link: "/notificaciones", listKey: "notifications" },
  { id: "report", label: "Informe de portafolio", path: "/api/planning/report", link: "/sin-conexion/informe", listKey: "rows" }
];

const userId = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour) throw new Error("No hay una cuenta autorizada para esta copia.");
  return user.id;
};

const denialKey = (moduleId) => `vera-offline-denied:${location.origin}:${userId()}:${moduleId}`;
const wasDenied = (moduleId) => localStorage.getItem(denialKey(moduleId)) === "1";
const markDenied = (moduleId) => localStorage.setItem(denialKey(moduleId), "1");
const clearDenied = (moduleId) => localStorage.removeItem(denialKey(moduleId));

const countBytes = (data) => new TextEncoder().encode(JSON.stringify(data)).byteLength;

export const getOfflineSnapshots = () => Object.fromEntries(Object.entries(readOfflineVault(userId()).snapshots)
  .filter(([moduleId]) => !wasDenied(moduleId)));

export const purgeDeniedOfflineSnapshots = async () => {
  const id = userId();
  const vault = readOfflineVault(id);
  const snapshots = { ...vault.snapshots };
  let evidenceFiles = vault.evidenceFiles || {};
  let removed = false;
  for (const moduleId of Object.keys(snapshots)) {
    if (wasDenied(moduleId)) {
      delete snapshots[moduleId];
      if (moduleId === "evidence") evidenceFiles = {};
      removed = true;
    }
  }
  if (removed) await saveOfflineVault(id, { ...vault, snapshots, evidenceFiles });
  return removed;
};

export const captureOfflineSnapshots = async (selectedIds) => {
  if (!navigator.onLine) throw new Error("Conéctate antes de actualizar la copia.");
  if (!localStorage.getItem("token")) throw new Error("Inicia sesión antes de actualizar la copia.");
  const id = userId();
  const selected = SNAPSHOT_MODULES.filter((module) => selectedIds.includes(module.id));
  if (!selected.length) throw new Error("Selecciona al menos una sección.");
  const previous = readOfflineVault(id);
  const snapshots = { ...previous.snapshots };
  let evidenceFiles = { ...(previous.evidenceFiles || {}) };
  const results = [];
  const refreshed = [];
  let revoked = false;
  let totalBytes = Object.values(snapshots).reduce((total, snapshot) => total + countBytes(snapshot.data), 0);
  for (const module of selected) {
    try {
      const response = await fetch(module.path, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        cache: "no-store", signal: AbortSignal.timeout(15000)
      });
      if (response.status === 403) {
        markDenied(module.id);
        if (snapshots[module.id]) {
          totalBytes -= countBytes(snapshots[module.id].data);
          delete snapshots[module.id];
          revoked = true;
        }
        if (module.id === "evidence") { evidenceFiles = {}; revoked = true; }
        results.push({ id: module.id, ok: false, message: "Sin permiso; copia local retirada", retained: false });
        continue;
      }
      if (!response.ok) throw new Error(response.status === 401
        ? "Sesión vencida; inicia sesión de nuevo" : `HTTP ${response.status}`);
      const data = await response.json();
      const bytes = countBytes(data);
      const priorBytes = snapshots[module.id] ? countBytes(snapshots[module.id].data) : 0;
      if (bytes > MAX_MODULE_BYTES || totalBytes - priorBytes + bytes > MAX_TOTAL_BYTES) {
        throw new Error("Esta sección supera el límite local; reduce los datos antes de descargarla.");
      }
      if (module.listKey && !Array.isArray(data[module.listKey])) {
        throw new Error("La respuesta no tiene el formato esperado.");
      }
      const savedAt = new Date().toISOString();
      snapshots[module.id] = { data, savedAt };
      if (module.id === "evidence") {
        const currentFiles = new Map(data.evidence.filter((item) => item.file)
          .map((item) => [String(item.id), item.file.path]));
        evidenceFiles = Object.fromEntries(Object.entries(evidenceFiles)
          .filter(([fileId, file]) => currentFiles.get(String(fileId)) === file.path));
      }
      refreshed.push(module.id);
      totalBytes = totalBytes - priorBytes + bytes;
      results.push({ id: module.id, ok: true, count: module.listKey ? data[module.listKey].length : null });
    } catch (error) {
      results.push({ id: module.id, ok: false, message: error.message,
        retained: Boolean(snapshots[module.id]) });
    }
  }
  if (refreshed.length || revoked) {
    await saveOfflineVault(id, { ...previous, snapshots, evidenceFiles,
      lastSyncAt: refreshed.length ? new Date().toISOString() : previous.lastSyncAt });
    for (const moduleId of refreshed) clearDenied(moduleId);
  }
  return results;
};

export const removeOfflineSnapshot = async (moduleId) => {
  if (!SNAPSHOT_MODULES.some((module) => module.id === moduleId)) throw new Error("Sección local desconocida.");
  const id = userId();
  const vault = readOfflineVault(id);
  const snapshots = { ...vault.snapshots };
  delete snapshots[moduleId];
  await saveOfflineVault(id, { ...vault, snapshots,
    evidenceFiles: moduleId === "evidence" ? {} : vault.evidenceFiles });
};

export const getOfflineSnapshot = (moduleId) => {
  const snapshot = getOfflineSnapshots()[moduleId];
  if (!snapshot) throw new Error("Esta sección no está guardada en el espacio local.");
  const age = Date.now() - Date.parse(snapshot.savedAt);
  if (!Number.isFinite(age) || age < 0 || age > SNAPSHOT_TTL_MS) {
    throw new Error("La copia local caducó. Conéctate y actualízala.");
  }
  return snapshot;
};

const moduleForRequest = (input, options) => {
  if ((options?.method || "GET").toUpperCase() !== "GET") return null;
  const url = new URL(input, location.origin);
  if (url.origin !== location.origin) return null;
  if (url.search && url.pathname !== "/api/notifications") return null;
  return SNAPSHOT_MODULES.find((module) => module.path === url.pathname) || null;
};

export const fetchWithOfflineFallback = async (input, options) => {
  try {
    const response = await fetch(input, options);
    const module = moduleForRequest(input, options);
    if (response.status === 403 && module) {
      markDenied(module.id);
      try { await removeOfflineSnapshot(module.id); } catch { /* El marcador impide mostrar la copia hasta revalidarla. */ }
    }
    window.dispatchEvent(new Event("vera:online-data"));
    return response;
  }
  catch (networkError) {
    const module = moduleForRequest(input, options);
    if (!module) throw networkError;
    const snapshot = getOfflineSnapshot(module.id);
    window.dispatchEvent(new CustomEvent("vera:offline-snapshot", {
      detail: { module: module.label, savedAt: snapshot.savedAt }
    }));
    return new Response(JSON.stringify(snapshot.data), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-VERA-Offline-Snapshot": snapshot.savedAt }
    });
  }
};
