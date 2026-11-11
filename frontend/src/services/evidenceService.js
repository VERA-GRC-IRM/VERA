import { fetchWithOfflineFallback } from "./offlineSnapshots";

const API_URL = "/api/evidence";

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

export const uploadEvidenceFile = async (details, file) => {
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
    text: "text/plain"
  };
  const mime = MIME_TYPES[extension] || "application/octet-stream";
  const params = new URLSearchParams({
    title: details.title, description: details.description, evidenceType: details.evidenceType,
    entityType: details.entityType, entityId: details.entityId
  });
  const response = await fetch(`${API_URL}/upload?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": mime || "application/octet-stream" },
    body: file
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo cargar el archivo.");
  return data;
};

export const getEvidenceDownloadUrl = async (id) => (await request(`/${encodeURIComponent(id)}/download`)).url;
export const askEvidenceFile = async (id, question) => request(`/${encodeURIComponent(id)}/ask`, {
  method: "POST", body: JSON.stringify({ question })
});
export const indexEvidenceImage = async (id) => request(`/${encodeURIComponent(id)}/index-image`, { method: "POST" });
