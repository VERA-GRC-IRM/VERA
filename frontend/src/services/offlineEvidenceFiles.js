import { readOfflineVault, saveOfflineVault } from "./offlineVault";
import { getOfflineSnapshot } from "./offlineSnapshots";

// Mantiene el respaldo cifrado bajo el límite de importación de 40 MiB aun con
// 8 MiB de secciones y tres borradores de archivo pendientes.
const MAX_FILES = 2;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

const userId = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour) throw new Error("No hay una cuenta autorizada para esta copia.");
  return user.id;
};

const fileFor = (id) => {
  const item = getOfflineSnapshot("evidence").data.evidence.find((row) => String(row.id) === String(id));
  if (!item?.file || !Number.isInteger(item.file.size) || item.file.size < 1 ||
      item.file.size > MAX_FILE_BYTES || typeof item.file.path !== "string" ||
      typeof item.file.mime !== "string") {
    throw new Error("Este archivo no está disponible en una copia vigente de Evidencias.");
  }
  return item;
};

const toBase64 = (bytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
};

const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const getOfflineEvidenceFiles = () => {
  const id = userId();
  const snapshot = getOfflineSnapshot("evidence");
  const allowed = new Map(snapshot.data.evidence.filter((row) => row.file)
    .map((row) => [String(row.id), row.file.path]));
  return Object.values(readOfflineVault(id).evidenceFiles || {})
    .filter((file) => allowed.get(String(file.id)) === file.path)
    .map(({ id: evidenceId, title, mime, size, savedAt }) => ({ id: evidenceId, title, mime, size, savedAt }));
};

export const saveOfflineEvidenceFile = async (evidenceId) => {
  if (!navigator.onLine) throw new Error("Conéctate para guardar el archivo.");
  const id = userId();
  const item = fileFor(evidenceId);
  const vault = readOfflineVault(id);
  const files = vault.evidenceFiles || {};
  const prior = files[item.id];
  if (!prior && Object.keys(files).length >= MAX_FILES) {
    throw new Error("El límite es de dos archivos guardados. Quita uno antes de continuar.");
  }
  const usedBytes = Object.values(files).reduce((total, file) => total + file.size, 0);
  if (usedBytes - (prior?.size || 0) + item.file.size > MAX_TOTAL_BYTES) {
    throw new Error("Los archivos guardados superan el límite local de 6 MiB.");
  }
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Inicia sesión antes de guardar el archivo.");
  const response = await fetch(`/api/evidence/${encodeURIComponent(item.id)}/content`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  if (response.status === 403 || response.status === 404) {
    const current = readOfflineVault(id);
    const nextFiles = { ...(current.evidenceFiles || {}) };
    delete nextFiles[item.id];
    const snapshots = { ...current.snapshots };
    if (snapshots.evidence?.data?.evidence) {
      snapshots.evidence = { ...snapshots.evidence, data: { ...snapshots.evidence.data,
        evidence: snapshots.evidence.data.evidence.filter((row) => String(row.id) !== String(item.id)) } };
    }
    await saveOfflineVault(id, { ...current, evidenceFiles: nextFiles, snapshots });
    throw new Error("Ya no tienes acceso a este archivo; se retiró de la copia local.");
  }
  if (!response.ok) throw new Error(response.status === 401
    ? "Sesión vencida; inicia sesión de nuevo." : `No se pudo guardar el archivo (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES ||
      response.headers.get("content-type")?.split(";")[0] !== item.file.mime ||
      response.headers.get("x-vera-evidence-path") !== item.file.path) {
    throw new Error("El archivo descargado no coincide con sus metadatos.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== item.file.size || bytes.length > MAX_FILE_BYTES) {
    throw new Error("El archivo cambió o la descarga está incompleta. Actualiza Evidencias.");
  }
  const current = readOfflineVault(id);
  await saveOfflineVault(id, { ...current, evidenceFiles: { ...(current.evidenceFiles || {}),
    [item.id]: { id: item.id, title: item.title, path: item.file.path,
      mime: item.file.mime, size: bytes.length, savedAt: new Date().toISOString(), base64: toBase64(bytes) } } });
  return { id: item.id, title: item.title };
};

export const removeOfflineEvidenceFile = async (evidenceId) => {
  const id = userId();
  const vault = readOfflineVault(id);
  const files = { ...(vault.evidenceFiles || {}) };
  delete files[evidenceId];
  await saveOfflineVault(id, { ...vault, evidenceFiles: files });
};

export const getOfflineEvidenceBlob = (evidenceId) => {
  const item = fileFor(evidenceId);
  const file = readOfflineVault(userId()).evidenceFiles?.[item.id];
  if (!file || file.path !== item.file.path || file.size !== item.file.size) {
    throw new Error("El archivo no está guardado en este dispositivo.");
  }
  const bytes = fromBase64(file.base64);
  if (bytes.length !== file.size) throw new Error("La copia local del archivo está dañada.");
  const extension = item.file.path.split(".").at(-1);
  return { blob: new Blob([bytes], { type: file.mime }), name: `evidencia-${item.id}.${extension}` };
};
