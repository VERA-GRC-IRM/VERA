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
