const API_URL = "/api/risk-library";

const request = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo consultar la biblioteca de riesgos.");
  return data;
};

export const getRiskLibrary = () => request("/");
export const getTemplateRevisions = async (id) =>
  (await request(`/templates/${encodeURIComponent(id)}/revisions`)).revisions;
export const createRiskCategory = async (category) =>
  (await request("/categories", { method: "POST", body: JSON.stringify(category) })).category;
export const publishRiskTemplate = async (template) =>
  (await request("/templates", { method: "POST", body: JSON.stringify(template) })).template;
export const reviseRiskTemplate = async (id, template) =>
  (await request(`/templates/${encodeURIComponent(id)}/revisions`, { method: "POST", body: JSON.stringify(template) })).template;
