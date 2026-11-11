import { readOfflineVault, saveOfflineVault } from "./offlineVault";
import { getOfflineSnapshot } from "./offlineSnapshots";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";

const sources = { RISK: { module: "risks", list: "risks", route: "risks", max: 2000 },
  CONTROL: { module: "controls", list: "controls", route: "controls", max: 1000 } };

const currentUser = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour || !RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    throw new Error("Tu cuenta no puede preparar ediciones de riesgos o controles.");
  }
  return user.id;
};

const recordsFor = (type) => {
  const source = sources[type];
  if (!source) throw new Error("Tipo de registro no admitido.");
  return getOfflineSnapshot(source.module).data[source.list].filter((item) =>
    Number.isSafeInteger(item.storageVersion) && item.storageVersion > 0 &&
    typeof item.description === "string" &&
    (item.updatedAt === null || typeof item.updatedAt === "string"));
};

export const getEditableOfflineRecords = (type) => {
  currentUser();
  return recordsFor(type).map(({ id, title, description }) => ({ id, title, description }));
};

export const saveOfflineRecordDescription = async ({ recordType, recordId, description, reason }) => {
  const id = currentUser();
  const source = sources[recordType];
  if (!source) throw new Error("Tipo de registro no admitido.");
  const record = recordsFor(recordType).find((item) => String(item.id) === String(recordId));
  if (!record) throw new Error("Selecciona un registro de una copia local vigente.");
  const value = String(description ?? "").trim();
  const why = String(reason ?? "").trim();
  if (value.length < 10 || value.length > source.max || value === record.description) {
    throw new Error(`Escribe una descripción nueva de 10 a ${source.max} caracteres.`);
  }
  if (why.length < 10 || why.length > 300) throw new Error("Explica el motivo en 10 a 300 caracteres.");
  const vault = readOfflineVault(id);
  if ((vault.drafts || []).length >= 50) throw new Error("Alcanzaste el límite de 50 borradores locales.");
  const draft = { id: crypto.randomUUID(), type: "RECORD_DESCRIPTION", state: "DRAFT",
    createdAt: new Date().toISOString(), recordType, recordId: record.id, title: record.title,
    description: value, reason: why, expected: { storageVersion: record.storageVersion,
      updatedAt: record.updatedAt, description: record.description } };
  await saveOfflineVault(id, { ...vault, drafts: [...(vault.drafts || []), draft] });
  return draft;
};

const markDraft = async (id, draftId, changes) => {
  const vault = readOfflineVault(id);
  await saveOfflineVault(id, { ...vault, drafts: vault.drafts.map((draft) =>
    draft.id === draftId ? { ...draft, ...changes } : draft) });
};

const messageFor = async (response) => {
  const body = await response.json().catch(() => ({}));
  return body.message || `El servidor respondió ${response.status}.`;
};

const readCurrent = async (draft, token) => {
  const source = sources[draft.recordType];
  const response = await fetch(`/api/${source.route}/`, { headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(await messageFor(response));
  const rows = (await response.json())[source.list];
  if (!Array.isArray(rows)) throw new Error("El servidor no devolvió registros válidos.");
  return rows.find((item) => String(item.id) === String(draft.recordId)) || null;
};

export const syncOfflineRecordDescription = async (draftId) => {
  if (!navigator.onLine) throw new Error("Conéctate antes de enviar la descripción.");
  const id = currentUser();
  const draft = (readOfflineVault(id).drafts || []).find((item) => item.id === draftId);
  if (!draft || draft.type !== "RECORD_DESCRIPTION" || draft.state !== "DRAFT") {
    throw new Error("Este borrador requiere revisión y no se reenviará automáticamente.");
  }
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Inicia sesión antes de enviar.");
  const current = await readCurrent(draft, token);
  if (!current || current.storageVersion !== draft.expected.storageVersion ||
      current.updatedAt !== draft.expected.updatedAt ||
      current.description !== draft.expected.description) {
    await markDraft(id, draftId, { state: "CONFLICT" });
    throw new Error("El registro cambió desde que preparaste el borrador. Compáralo antes de decidir.");
  }
  let response;
  try {
    response = await fetch(`/api/${sources[draft.recordType].route}/${encodeURIComponent(draft.recordId)}/offline-description`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ description: draft.description, reason: draft.reason, expected: draft.expected }),
      cache: "no-store", signal: AbortSignal.timeout(15000)
    });
  } catch {
    await markDraft(id, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("La edición pudo haberse aplicado. Revisa el registro actual antes de preparar otro cambio.");
  }
  if ([403, 404, 409].includes(response.status)) {
    await markDraft(id, draftId, { state: "CONFLICT" });
    throw new Error("El acceso o el registro cambió durante el envío. Revísalo antes de decidir.");
  }
  if (response.status >= 500) {
    await markDraft(id, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("El servidor no confirmó la edición. Revisa el registro antes de otro envío.");
  }
  if (!response.ok) throw new Error(await messageFor(response));
  let body;
  try { body = await response.json(); }
  catch {
    await markDraft(id, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("La respuesta no confirmó la edición. Revisa el registro actual.");
  }
  const saved = body[draft.recordType === "RISK" ? "risk" : "control"];
  if (String(saved?.id) !== String(draft.recordId) || saved.description !== draft.description) {
    await markDraft(id, draftId, { state: "NEEDS_REVIEW" });
    throw new Error("La respuesta no coincide con el borrador. Revisa el registro actual.");
  }
  await markDraft(id, draftId, { state: "SYNCED", syncedAt: new Date().toISOString() });
  return saved;
};

export const inspectOfflineRecordConflict = async (draftId) => {
  if (!navigator.onLine) throw new Error("Conéctate para consultar el registro actual.");
  currentUser();
  const draft = (readOfflineVault(currentUser()).drafts || []).find((item) => item.id === draftId);
  if (!draft || draft.type !== "RECORD_DESCRIPTION" || draft.state !== "CONFLICT") {
    throw new Error("Selecciona un borrador de descripción con conflicto.");
  }
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Inicia sesión para comparar.");
  const record = await readCurrent(draft, token);
  if (!record) throw new Error("El registro ya no está disponible con tu cuenta.");
  return { title: record.title, description: record.description,
    storageVersion: record.storageVersion, updatedAt: record.updatedAt };
};
