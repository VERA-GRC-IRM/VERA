const API_URL = "/api/risk-library";

const request = async (path) => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo consultar la biblioteca de riesgos.");
  return data;
};

export const getRiskLibrary = () => request("/");
export const getTemplateRevisions = async (id) =>
  (await request(`/templates/${encodeURIComponent(id)}/revisions`)).revisions;
