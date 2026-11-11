import { readOfflineVault, saveOfflineVault } from "./offlineVault";
import { getOfflineSnapshot } from "./offlineSnapshots";

const MAX_DRAFTS = 50;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const FILE_MIME = {
  pdf: "application/pdf", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", txt: "text/plain"
};
const currentUser = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour) throw new Error("No hay una cuenta autorizada para este borrador.");
  return user.id;
};

export const getOfflineDrafts = () => (readOfflineVault(currentUser()).drafts || [])
  .map((draft) => { const metadata = { ...draft }; delete metadata.fileBase64; return metadata; });

export const getEvidenceDraftTargets = () => {
  const sources = [
    { id: "risks", type: "RISK", field: "risks" },
    { id: "controls", type: "CONTROL", field: "controls" },
    { id: "activeAudits", type: "AUDIT", field: "audits" }
  ];
  return sources.flatMap((source) => {
    try { return getOfflineSnapshot(source.id).data[source.field].map((item) => ({
      entityType: source.type, entityId: item.id, title: item.title
    })); }
    catch { return []; }
  });
};

const toBase64 = (bytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
};

const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const saveOfflineEvidenceDraft = async (details, file) => {
  const userId = currentUser();
  const vault = readOfflineVault(userId);
  const drafts = vault.drafts || [];
  if (drafts.length >= MAX_DRAFTS || drafts.filter((item) => item.type === "EVIDENCE_UPLOAD" && item.state !== "SYNCED").length >= MAX_FILES) {
    throw new Error("Alcanzaste el límite de borradores o archivos pendientes.");
  }
  const title = String(details.title ?? "").trim();
  const description = String(details.description ?? "").trim();
  const evidenceType = String(details.evidenceType ?? "");
  const entityType = String(details.entityType ?? "");
  const entityId = String(details.entityId ?? "");
  if (title.length < 3 || title.length > 120 || description.length < 10 || description.length > 1000) {
    throw new Error("Revisa el nombre (3–120) y la descripción (10–1,000 caracteres).");
  }
  if (!["DOCUMENT", "SCREENSHOT", "REPORT", "OTHER"].includes(evidenceType)) throw new Error("Tipo de evidencia inválido.");
  if (!["RISK", "CONTROL", "AUDIT"].includes(entityType)
    || !getEvidenceDraftTargets().some((item) => item.entityType === entityType && String(item.entityId) === entityId)) {
    throw new Error("El expediente no está en una copia local vigente.");
  }
  if (entityType === "AUDIT" && !["SUPER_ADMIN", "GERENTE"].includes(JSON.parse(localStorage.getItem("user") || "null")?.role)) {
    throw new Error("Tu rol no puede adjuntar archivos a auditorías.");
  }
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("Selecciona un archivo de hasta 3 MiB.");
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const mime = FILE_MIME[extension];
  if (!mime) throw new Error("Tipo de archivo no admitido.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const draft = {
    id: crypto.randomUUID(), type: "EVIDENCE_UPLOAD", state: "DRAFT", createdAt: new Date().toISOString(),
    title, description, evidenceType, entityType, entityId, fileName: file.name, mime,
    fileBytes: bytes.byteLength, fileBase64: toBase64(bytes)
  };
  await saveOfflineVault(userId, { ...vault, drafts: [...drafts, draft] });
  return { ...draft, fileBase64: undefined };
};

export const getDraftableActions = () => {
  const snapshot = getOfflineSnapshot("actions");
  return snapshot.data.actions.filter((action) => action.sourceType === "FINDING"
    && Number.isInteger(action.storageVersion));
};

export const saveOfflineDraft = async (input) => {
  const userId = currentUser();
  const vault = readOfflineVault(userId);
  const note = String(input.note ?? "").trim();
  const type = input.type;
  let draft;
  if (type === "GENERAL_NOTE") {
    const title = String(input.title ?? "").trim();
    if (title.length < 3 || title.length > 120 || note.length < 3 || note.length > 5000) {
      throw new Error("Usa un título de 3 a 120 caracteres y una nota de 3 a 5,000.");
    }
    draft = { type, title, note };
  } else if (type === "ACTION_COMMENT" || type === "ACTION_PROGRESS") {
    const action = getDraftableActions().find((item) => String(item.id) === String(input.actionId));
    if (!action) throw new Error("El plan no está en una copia local vigente.");
    if (note.length < (type === "ACTION_PROGRESS" ? 10 : 2) || note.length > 1000) {
      throw new Error("La explicación no cumple la longitud requerida para este plan.");
    }
    draft = { type, actionId: action.id, title: action.title, version: action.storageVersion, note };
    if (type === "ACTION_PROGRESS") {
      const progressPercent = Number(input.progressPercent);
      if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        throw new Error("El avance debe ser un entero entre 0 y 100.");
      }
      draft.progressPercent = progressPercent;
    }
  } else throw new Error("Tipo de borrador no admitido.");

  const drafts = vault.drafts || [];
  if (drafts.length >= MAX_DRAFTS) throw new Error("Alcanzaste el límite de 50 borradores locales.");
  const saved = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: "DRAFT" };
  await saveOfflineVault(userId, { ...vault, drafts: [...drafts, saved] });
  return saved;
};

export const deleteOfflineDraft = async (draftId) => {
  const userId = currentUser();
  const vault = readOfflineVault(userId);
  const drafts = (vault.drafts || []).filter((item) => item.id !== draftId);
  if (drafts.length === (vault.drafts || []).length) throw new Error("El borrador no existe.");
  await saveOfflineVault(userId, { ...vault, drafts });
};

const markDraft = async (userId, draftId, changes) => {
  const vault = readOfflineVault(userId);
  const drafts = (vault.drafts || []).map((item) => item.id === draftId ? { ...item, ...changes } : item);
  await saveOfflineVault(userId, { ...vault, drafts });
};

const responseMessage = async (response) => {
  const body = await response.json().catch(() => ({}));
  return body.message || `El servidor respondió ${response.status}.`;
};

export const syncOfflineDraft = async (draftId) => {
  if (!navigator.onLine) throw new Error("Conéctate antes de enviar el borrador.");
  const userId = currentUser();
  const draft = getOfflineDrafts().find((item) => item.id === draftId);
  if (!draft || !["ACTION_COMMENT", "ACTION_PROGRESS"].includes(draft.type)) {
    throw new Error("Este borrador no se puede enviar automáticamente.");
  }
  if (draft.state !== "DRAFT") throw new Error("Este borrador requiere revisión antes de volver a enviarse.");
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Inicia sesión antes de enviar.");
  const url = `/api/actions/${encodeURIComponent(draft.actionId)}`;
  const current = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000)
  });
  if (!current.ok) throw new Error(await responseMessage(current));
  const action = (await current.json()).action;
  if (!action || action.storageVersion !== draft.version) {
    await markDraft(userId, draftId, { state: "CONFLICT" });
    throw new Error("El plan cambió desde que guardaste el borrador. Revisa el plan antes de editarlo de nuevo.");
  }
  const payload = { version: draft.version, note: draft.note,
    ...(draft.type === "ACTION_PROGRESS" ? { progressPercent: draft.progressPercent } : {}) };
  let response;
  try {
    response = await fetch(`${url}/${draft.type === "ACTION_PROGRESS" ? "progress" : "comments"}`, {
      method: draft.type === "ACTION_PROGRESS" ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(15000)
    });
  } catch {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("No se pudo confirmar la respuesta del servidor. Revisa el plan antes de intentar otro envío.");
  }
  if (response.status === 409) {
    await markDraft(userId, draftId, { state: "CONFLICT" });
    throw new Error("El plan cambió durante el envío. Revisa su versión actual.");
  }
  if (!response.ok) throw new Error(await responseMessage(response));
  let body;
  try { body = await response.json(); }
  catch {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("El servidor aceptó la solicitud, pero no se pudo confirmar el resultado. Revisa el plan.");
  }
  if (String(body.action?.id) !== String(draft.actionId)
    || !Number.isInteger(body.action?.storageVersion)
    || body.action.storageVersion <= draft.version) {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("La respuesta del servidor no confirma la versión aplicada. Revisa el plan.");
  }
  await markDraft(userId, draftId, { state: "SYNCED", syncedAt: new Date().toISOString(),
    serverVersion: body.action.storageVersion });
  return body.action;
};

export const syncOfflineEvidenceDraft = async (draftId) => {
  if (!navigator.onLine) throw new Error("Conéctate antes de cargar la evidencia.");
  const userId = currentUser();
  const draft = (readOfflineVault(userId).drafts || []).find((item) => item.id === draftId);
  if (!draft || draft.type !== "EVIDENCE_UPLOAD" || draft.state !== "DRAFT") {
    throw new Error("Este archivo requiere revisión antes de volver a enviarse.");
  }
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Inicia sesión antes de cargar la evidencia.");
  const params = new URLSearchParams({ title: draft.title, description: draft.description,
    evidenceType: draft.evidenceType, entityType: draft.entityType, entityId: draft.entityId });
  let response;
  try {
    response = await fetch(`/api/evidence/upload?${params}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": draft.mime },
      body: fromBase64(draft.fileBase64), cache: "no-store", signal: AbortSignal.timeout(30000)
    });
  } catch {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("La carga pudo haberse completado. Revisa Evidencias antes de repetirla.");
  }
  if (response.status >= 500) {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("El servidor no confirmó la carga. Revisa Evidencias antes de repetirla.");
  }
  if (!response.ok) throw new Error(await responseMessage(response));
  let body;
  try { body = await response.json(); }
  catch {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("El servidor respondió, pero no confirmó el archivo. Revisa Evidencias.");
  }
  if (!body.evidence?.id) {
    await markDraft(userId, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("El servidor no confirmó el ID de evidencia. Revisa Evidencias.");
  }
  await markDraft(userId, draftId, { state: "SYNCED", syncedAt: new Date().toISOString(),
    evidenceId: body.evidence.id, fileBase64: undefined });
  return body.evidence;
};
