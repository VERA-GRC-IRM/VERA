const API_URL = "/api/risks";

const request = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo completar la acción.");
  return data;
};

export const getRisks = async (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return (await request(`/?${query}`)).risks;
};
export const getRiskOwners = async () => (await request("/owners")).owners;
export const createRisk = async (risk) => (await request("/", { method: "POST", body: JSON.stringify(risk) })).risk;
export const updateRisk = async (id, risk) => (await request(`/${id}`, { method: "PUT", body: JSON.stringify(risk) })).risk;
export const evaluateRisk = async (id, assessment) => (await request(`/${id}/evaluate`, { method: "POST", body: JSON.stringify(assessment) })).risk;
export const proposeRiskResponse = async (id, proposal) =>
  (await request(`/${encodeURIComponent(id)}/response`, { method: "POST", body: JSON.stringify(proposal) })).risk;
export const getAuditRisks = async (auditId) => (await request(`/audit/${encodeURIComponent(auditId)}`)).risks;
export const createAuditRisk = async (auditId, risk) =>
  (await request(`/audit/${encodeURIComponent(auditId)}`, { method: "POST", body: JSON.stringify(risk) })).risk;
export const unlinkAuditRisk = async (auditId, riskId) =>
  (await request(`/audit/${encodeURIComponent(auditId)}/${encodeURIComponent(riskId)}`, { method: "DELETE" })).risk;
export const updateAuditRisk = async (auditId, riskId, risk) =>
  (await request(`/audit/${encodeURIComponent(auditId)}/${encodeURIComponent(riskId)}`, { method: "PATCH", body: JSON.stringify(risk) })).risk;
export const evaluateAuditRisk = async (auditId, riskId, assessment) =>
  (await request(`/audit/${encodeURIComponent(auditId)}/${encodeURIComponent(riskId)}/evaluate`, { method: "POST", body: JSON.stringify(assessment) })).risk;
