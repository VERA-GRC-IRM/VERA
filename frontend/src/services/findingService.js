import { fetchWithOfflineFallback } from "./offlineSnapshots";

const API_URL = "/api/findings";

const request = async (path, options = {}) => {
  const response = await fetchWithOfflineFallback(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo completar la acción.");
  return data;
};

export const getFindings = async () => (await request("/")).findings;
export const createFinding = async (finding) => (await request("/", {
  method: "POST", body: JSON.stringify(finding)
})).finding;
export const closeFinding = async (id, version, note) => (await request(`/${encodeURIComponent(id)}/close`, {
  method: "PATCH", body: JSON.stringify({ version, note })
})).finding;
