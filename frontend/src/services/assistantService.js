const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

export const getAssistantStatus = async () => {
  const response = await fetch("/api/assistant/status", { headers: headers() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar el estado del asistente.");
  return data;
};

export const getAssistantSpeechToken = async () => {
  const response = await fetch("/api/assistant/speech/token", { headers: headers(), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo iniciar el dictado.");
  return data;
};

const conversationRequest = async (path = "", options = {}) => {
  const response = await fetch(`/api/assistant/conversations${path}`, {
    ...options, headers: { ...headers(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store"
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar el historial privado.");
  return data;
};

export const listAssistantConversations = async () => (await conversationRequest()).conversations;
export const getAssistantConversation = async (id) => (await conversationRequest(`/${encodeURIComponent(id)}`)).conversation;
export const createAssistantConversation = async (focus, projectId = null) => (await conversationRequest("", {
  method: "POST", body: JSON.stringify({ focus, projectId })
})).conversation;
export const renameAssistantConversation = async (id, title, version) =>
  (await conversationRequest(`/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ title, version })
  })).conversation;
export const deleteAssistantConversation = async (id) => conversationRequest(`/${encodeURIComponent(id)}`, {
  method: "DELETE"
});
export const moveAssistantConversation = async (id, projectId, version) =>
  (await conversationRequest(`/${encodeURIComponent(id)}/project`, {
    method: "PATCH", body: JSON.stringify({ projectId, version })
  })).conversation;
const projectRequest = async (path = "", options = {}) => {
  const response = await fetch(`/api/assistant/projects${path}`, {
    ...options, headers: { ...headers(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store"
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar tus proyectos privados.");
  return data;
};
export const listAssistantProjects = async () => (await projectRequest()).projects;
export const createAssistantProject = async (name, description = "", instructions = "") =>
  (await projectRequest("", { method: "POST", body: JSON.stringify({ name, description, instructions }) })).project;
export const updateAssistantProject = async (id, name, description, instructions, version) =>
  (await projectRequest(`/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ name, description, instructions, version })
  })).project;
export const deleteAssistantProject = async (id) => projectRequest(`/${encodeURIComponent(id)}`, {
  method: "DELETE"
});
export const listAssistantProjectFiles = async (id) =>
  (await projectRequest(`/${encodeURIComponent(id)}/files`)).files;
export const uploadAssistantProjectFile = async (id, file) => {
  const response = await fetch(`/api/assistant/projects/${encodeURIComponent(id)}/files`, {
    method: "POST", headers: { ...headers(), "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name) }, body: file, cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo agregar el archivo privado al proyecto.");
  return data.file;
};
export const deleteAssistantProjectFile = async (id, fileId) =>
  projectRequest(`/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
export const getAssistantProjectFileDownload = async (id, fileId) =>
  (await projectRequest(`/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download`)).url;
export const ocrAssistantProjectFile = async (id, fileId) =>
  (await projectRequest(`/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/ocr`,
    { method: "POST" })).file;
export const indexAssistantProjectFile = async (id, fileId) =>
  projectRequest(`/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/semantic`,
    { method: "POST" });
const memoryRequest = async (path = "", options = {}) => {
  const response = await fetch(`/api/assistant/memories${path}`, {
    ...options, headers: { ...headers(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store"
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar tu memoria privada.");
  return data;
};
export const listAssistantMemories = async () => (await memoryRequest()).memories;
export const createAssistantMemory = async (content) =>
  (await memoryRequest("", { method: "POST", body: JSON.stringify({ content }) })).memory;
export const updateAssistantMemory = async (id, content, enabled, version) =>
  (await memoryRequest(`/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ content, enabled, version })
  })).memory;
export const deleteAssistantMemory = async (id) => memoryRequest(`/${encodeURIComponent(id)}`, {
  method: "DELETE"
});
export const askAssistantConversation = async (id, question, withEvidence = false,
  attachmentId = null, projectFiles = false) =>
  conversationRequest(`/${encodeURIComponent(id)}/ask`, {
    method: "POST", body: JSON.stringify({ question, withEvidence, attachmentId, projectFiles })
  });
export const listAssistantAttachments = async (id) =>
  (await conversationRequest(`/${encodeURIComponent(id)}/attachments`)).attachments;
export const uploadAssistantAttachment = async (id, file) => {
  const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}/attachments`, {
    method: "POST", headers: { ...headers(), "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name) }, body: file, cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo adjuntar el archivo privado.");
  return data.attachment;
};
export const deleteAssistantAttachment = async (id, attachmentId) =>
  conversationRequest(`/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE"
  });
export const getAssistantAttachmentDownload = async (id, attachmentId) =>
  (await conversationRequest(`/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/download`)).url;
export const ocrAssistantAttachment = async (id, attachmentId) =>
  (await conversationRequest(`/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/ocr`,
    { method: "POST" })).attachment;

export const getAssistantBrief = async () => {
  const response = await fetch("/api/assistant/brief", { headers: headers() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudieron cargar las prioridades.");
  return data;
};

export const getAssistantQuality = async () => {
  const response = await fetch("/api/assistant/quality", { headers: headers(), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo consultar la calidad del asistente.");
  return data;
};

export const getAssistantInsights = async () => {
  const response = await fetch("/api/assistant/insights", { headers: headers() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudieron cargar las prioridades.");
  return data;
};

export const getProposalDraft = async (riskId) => {
  const response = await fetch("/api/assistant/draft-proposal", {
    method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ riskId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo preparar el borrador.");
  return data;
};

export const submitAssistantFeedback = async (feedbackToken, rating) => {
  const response = await fetch("/api/assistant/feedback", {
    method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ feedbackToken, rating })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo registrar tu valoración.");
  return data;
};

export const askAssistant = async (question, { history = [], focus = null, lastBrowse = null } = {}) => {
  const response = await fetch("/api/assistant/ask", {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, focus, lastBrowse })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo obtener una respuesta.");
  return data;
};

export const searchAssistantEvidence = async (question, focus = null) => {
  const response = await fetch("/api/assistant/search-evidence", {
    method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ question, focus })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudieron consultar las evidencias.");
  return data;
};

export const getAuditDossier = async (auditId) => {
  const response = await fetch(`/api/assistant/dossier/${encodeURIComponent(auditId)}`, {
    method: "POST", headers: headers()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo preparar el briefing.");
  return data;
};
