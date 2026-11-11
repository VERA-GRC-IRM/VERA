import { readOfflineVault, saveOfflineVault } from "./offlineVault";
import { getOfflineSnapshot } from "./offlineSnapshots";

const MAX_DRAFTS = 50;
const currentUser = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour) throw new Error("No hay una cuenta autorizada para este borrador.");
  return user.id;
};

export const getOfflineDrafts = () => readOfflineVault(currentUser()).drafts || [];

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
