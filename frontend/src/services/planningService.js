const API_URL = "/api/planning";

const request = async (path, options = {}) => {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "No se pudo completar la acción.");
  }

  return data;
};

export const getPlanningAudits = async () => {
  const data = await request("");
  return data.proposals;
};

export const searchPlanningAudits = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value ?? "").trim()) params.set(key, String(value).trim());
  });
  const data = await request(`/search${params.size ? `?${params}` : ""}`);
  return data.audits;
};

const reportParams = (filters, format) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value ?? "").trim()) params.set(key, String(value).trim());
  });
  if (format) params.set("format", format);
  return params.toString();
};

export const getPortfolioReport = (filters = {}) => request(`/report?${reportParams(filters)}`);

export const downloadPortfolioReport = async (filters = {}) => {
  const response = await fetch(`${API_URL}/report?${reportParams(filters, "csv")}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo descargar el reporte.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vera-reporte-portafolio.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const getActiveAudits = async () => {
  const data = await request("/active");
  return data.audits;
};

export const getAuditContext = (id) => request(`/${encodeURIComponent(id)}/context`);

export const getAuditors = async () => {
  const data = await request("/auditors");
  return data.auditors;
};

export const createAuditProposal = async (proposal) => {
  const data = await request("", { method: "POST", body: JSON.stringify(proposal) });
  return data.proposal;
};

export const updateAuditProposal = async (id, proposal) => {
  const data = await request(`/${id}`, { method: "PUT", body: JSON.stringify(proposal) });
  return data.proposal;
};

export const approveAuditProposal = async (id, quarter) => {
  const data = await request(`/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ quarter })
  });
  return data.proposal;
};

export const rejectAuditProposal = async (id, reason) => {
  const data = await request(`/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return data.proposal;
};

export const startAudit = async (id) => {
  const data = await request(`/${id}/start`, { method: "POST", body: JSON.stringify({}) });
  return data.audit;
};

export const closeAudit = async (id) => {
  const data = await request(`/${id}/close`, { method: "POST", body: JSON.stringify({}) });
  return data.audit;
};

export const updateAuditWorkflowStep = async (id, step) => {
  const data = await request(`/${id}/workflow-step`, {
    method: "PATCH",
    body: JSON.stringify({ step })
  });
  return data.audit;
};

export const deleteAuditProposal = async (id) => {
  await request(`/${id}`, { method: "DELETE" });
};

export const editAudit = async (id, changes) => {
  const data = await request(`/${id}/details`, { method: "PATCH", body: JSON.stringify(changes) });
  return data.audit;
};
