import { fetchWithOfflineFallback } from "./offlineSnapshots";

const API_URL = "/api/controls";

const request = async (path, options = {}) => {
  const response = await fetchWithOfflineFallback(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo completar la acción.");
  return data;
};

export const getControls = async () => (await request("/")).controls;
export const createControl = async (control) => (await request("/", { method: "POST", body: JSON.stringify(control) })).control;
export const updateControl = async (id, control) => (await request(`/${id}`, { method: "PUT", body: JSON.stringify(control) })).control;
export const evaluateControl = async (id, evaluation) => (await request(`/${id}/evaluate`, { method: "POST", body: JSON.stringify(evaluation) })).control;
