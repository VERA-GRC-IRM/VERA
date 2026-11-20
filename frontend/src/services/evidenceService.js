import { fetchWithOfflineFallback } from "./offlineSnapshots";
import { sendEvidenceUpload } from "./fileUpload";
import { uploadResumableEvidence } from "./resumableEvidenceUpload";

const API_URL = "/api/evidence";
export const STANDARD_EVIDENCE_MAX_BYTES = 3 * 1024 * 1024;
export const LARGE_EVIDENCE_MAX_BYTES = 200 * 1024 * 1024;
export const largeEvidenceUploadsEnabled = import.meta.env?.VITE_VERA_RESUMABLE_UPLOADS_ENABLED === "true" &&
  import.meta.env?.VITE_VERA_LARGE_EVIDENCE_UPLOADS_ENABLED === "true";
export const evidenceUploadMaxBytes = largeEvidenceUploadsEnabled
  ? LARGE_EVIDENCE_MAX_BYTES : STANDARD_EVIDENCE_MAX_BYTES;
export const evidenceUploadMaxLabel = largeEvidenceUploadsEnabled ? "200 MiB" : "3 MiB";

const request = async (path = "", options = {}) => {
  const response = await fetchWithOfflineFallback(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo completar la acción.");
  return data;
};

export const getEvidence = async (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return (await request(`/?${query}`)).evidence;
};
export const createEvidence = async (evidence) => (await request("/", { method: "POST", body: JSON.stringify(evidence) })).evidence;

export const uploadEvidenceFile = async (details, file, { onProgress, signal } = {}) => {
  if (!file || file.size < 1 || file.size > evidenceUploadMaxBytes) {
    throw new Error(`El archivo debe tener entre 1 byte y ${evidenceUploadMaxLabel}.`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  const MIME_TYPES = {
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    txt: "text/plain"
  };
  const mime = MIME_TYPES[extension] || "application/octet-stream";
  if (largeEvidenceUploadsEnabled && file.size > STANDARD_EVIDENCE_MAX_BYTES) {
    const { uploadDirectTusEvidence } = await import("./directTusEvidenceUpload");
    return uploadDirectTusEvidence(details, file, mime, { onProgress, signal });
  }
  if (import.meta.env.VITE_VERA_RESUMABLE_UPLOADS_ENABLED === "true" && !details.revisionOf) {
    return uploadResumableEvidence(details, file, mime, localStorage.getItem("token"), { onProgress, signal });
  }
  const params = new URLSearchParams({
    title: details.title, description: details.description, evidenceType: details.evidenceType,
    entityType: details.entityType, entityId: details.entityId,
    ...(details.revisionOf ? { revisionOf: details.revisionOf } : {})
  });
  return sendEvidenceUpload(`${API_URL}/upload?${params}`, file, mime,
    localStorage.getItem("token"), { onProgress, signal });
};

export const getEvidenceDownloadUrl = async (id) => (await request(`/${encodeURIComponent(id)}/download`)).url;
export const askEvidenceFile = async (id, question) => request(`/${encodeURIComponent(id)}/ask`, {
  method: "POST", body: JSON.stringify({ question })
});
export const indexEvidenceImage = async (id) => request(`/${encodeURIComponent(id)}/index-image`, { method: "POST" });
