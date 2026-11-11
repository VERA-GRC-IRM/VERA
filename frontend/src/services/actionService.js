import { fetchWithOfflineFallback } from "./offlineSnapshots";

const request = async (path = "", options = {}) => {
  const response = await fetchWithOfflineFallback(`/api/actions${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar el seguimiento.");
  return data;
};

export const getActions = () => request();
export const getAuditActions = (auditId) => request(`/for-audit/${encodeURIComponent(auditId)}`);
export const getActionSources = () => request("/sources");
export const getActionAssignees = (sourceType, sourceId) => request(
  `/assignees?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}`
);
export const createAction = (payload) => request("", { method: "POST", body: JSON.stringify(payload) });
export const changeActionStatus = (id, payload) => request(`/${encodeURIComponent(id)}/status`, {
  method: "PATCH", body: JSON.stringify(payload)
});
export const reassignAction = (id, payload) => request(`/${encodeURIComponent(id)}/assignee`, {
  method: "PATCH", body: JSON.stringify(payload)
});
export const getPlanEvidence = (id) => request(`/${encodeURIComponent(id)}/evidence-options`);
export const updatePlanProgress = (id, payload) => request(`/${encodeURIComponent(id)}/progress`, {
  method: "PATCH", body: JSON.stringify(payload)
});
export const addPlanComment = (id, payload) => request(`/${encodeURIComponent(id)}/comments`, {
  method: "POST", body: JSON.stringify(payload)
});
export const requestPlanValidation = (id, payload) => request(`/${encodeURIComponent(id)}/validation-request`, {
  method: "POST", body: JSON.stringify(payload)
});
