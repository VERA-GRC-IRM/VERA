const request = async (path, options = {}) => {
  const response = await fetch(`/api/risks/methods${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo consultar el catálogo de métodos.");
  return data;
};

export const getMethodDrafts = async () => (await request("/drafts")).methods;
export const getMethodRevisions = async (id) =>
  (await request(`/drafts/${encodeURIComponent(id)}/revisions`)).revisions;
export const saveMethodDraft = async (method, id = null) =>
  (await request(id ? `/drafts/${encodeURIComponent(id)}/revisions` : "/drafts", {
    method: "POST", body: JSON.stringify(method)
  })).method;
export const previewMethod = async (body) =>
  (await request("/preview", { method: "POST", body: JSON.stringify(body) })).preview;
