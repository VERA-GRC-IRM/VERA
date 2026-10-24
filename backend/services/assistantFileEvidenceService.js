const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const attachments = require("../repositories/assistantAttachmentRepository");
const { RECORD_CREATE_ROLES } = require("../config/roles");
const { parseEvidence } = require("./evidenceCreationService");
const { canReplayEvidence } = require("./creationReplayScope");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:vincula|vincular|guarda|guardar)\s+(?:este\s+|el\s+)?archivo\s+como\s+evidencia(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar archivo como evidencia|confirmo el archivo como evidencia)$/i.test(question.trim());
const isFileEvidenceCommand = (question, thread) => intent(question) || confirm(question) ||
  thread.messages.at(-1)?.actionDraft?.type === "FILE_EVIDENCE_FIELDS" && /^t[ií]tulo\s*:/i.test(question.trim());
const FIELD_NAMES = { titulo: "title", descripcion: "description", tipo: "evidenceType",
  entidad: "entityType", identificador: "entityId" };
const TYPES = { documento: "DOCUMENT", captura: "SCREENSHOT", reporte: "REPORT", otro: "OTHER" };
const ENTITIES = { riesgo: "RISK", control: "CONTROL", auditoria: "AUDIT" };
const template = `Con un archivo privado seleccionado en el chat, envía estos campos en un solo mensaje:\nTítulo: Acta de revisión\nDescripción: Documento que respalda la revisión del proceso auditado\nTipo: documento\nEntidad: auditoría\nIdentificador: AUD-01\nUsa el identificador exacto de un registro visible. VERA copiará el archivo al expediente; el adjunto original seguirá en la conversación.`;
const parseFields = (question) => {
  const lines = question.trim().split(/\r?\n/);
  if (intent(lines[0])) lines.shift();
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]{1,30}):\s*(.{1,800})$/);
    const key = match && FIELD_NAMES[normalize(match[1])];
    if (!key || Object.hasOwn(fields, key)) return { error: "Usa una línea por campo, sin repetirlos: Título, Descripción, Tipo, Entidad e Identificador." };
    fields[key] = match[2].trim();
  }
  if (Object.values(FIELD_NAMES).some((key) => !fields[key])) {
    return { error: "Faltan campos: Título, Descripción, Tipo, Entidad e Identificador." };
  }
  fields.evidenceType = TYPES[normalize(fields.evidenceType)] || fields.evidenceType.toUpperCase();
  fields.entityType = ENTITIES[normalize(fields.entityType)] || fields.entityType.toUpperCase();
  return { fields };
};
const sourceFor = async (user, thread, source) => {
  if (!source?.id) return null;
  if (source.projectId) {
    if (thread.projectId !== source.projectId) return null;
    return attachments.getProject(user, source.projectId, source.id);
  }
  return attachments.get(user, thread.id, source.id);
};
const sourceKey = (file) => file && ({ id: file.id, projectId: file.project_id || null });
const fieldsDraft = (file) => ({ actionDraft: { type: "FILE_EVIDENCE_FIELDS",
  source: sourceKey(file), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } });

const handleFileEvidence = async (user, question, thread, selectedFile) => {
  if (!isFileEvidenceCommand(question, thread)) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RECORD_CREATE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar archivos, pero no registrarlos como evidencia.");
  }
  if (confirm(question)) {
    const reservation = thread.messages.at(-1)?.actionReservation;
    if (reservation?.type === "FILE_EVIDENCE_CREATE") {
      let data;
      try { data = await parseEvidence(user, { ...reservation.data, reference: "Archivo privado almacenado en VERA" }); }
      catch (error) { if (error.status) return response("El expediente ya no está disponible. Solicita una vista previa nueva."); throw error; }
      const existing = (await evidenceRepository.getAll()).find((item) => item.aiOperationId === reservation.operationId);
      return existing && canReplayEvidence(existing, user, data) && Boolean(existing.file)
        ? response(`El archivo ya quedó registrado como evidencia ${existing.id}.`,
          "action-executed", { actionOutcome: { id: existing.id } })
        : Date.now() - Date.parse(reservation.createdAt) < 120_000
          ? response("La confirmación sigue en curso. Espera unos segundos y consulta de nuevo.", "action-pending")
          : response("No hay constancia del registro. Pide una vista previa nueva antes de intentarlo otra vez.");
    }
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "FILE_EVIDENCE_CREATE") {
      return response("No hay un archivo pendiente. Selecciónalo y pide una vista previa nueva.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara el vínculo de nuevo.");
    if (!await sourceFor(user, thread, draft.source)) return response("El archivo privado ya no está disponible. Vuelve a adjuntarlo.");
    return response("Reservando el archivo como evidencia.", "action-reservation", { fileEvidenceCreate: draft });
  }
  const raw = question.trim();
  const pending = thread.messages.at(-1)?.actionDraft;
  const file = intent(raw) ? selectedFile : pending?.type === "FILE_EVIDENCE_FIELDS" &&
    Date.parse(pending.expiresAt) >= Date.now() ? await sourceFor(user, thread, pending.source) : null;
  if (!file) return response("Selecciona primero un archivo privado individual en esta conversación. Después escribe «Vincula este archivo como evidencia».");
  if (intent(raw) && !raw.includes("\n")) return response(template, "action-guidance", fieldsDraft(file));
  const parsed = parseFields(raw);
  if (parsed.error) return response(`${parsed.error}\n${template}`, "action-guidance", fieldsDraft(file));
  let data;
  try { data = await parseEvidence(user, { ...parsed.fields, reference: "Archivo privado almacenado en VERA" }); }
  catch (error) { if (error.status) return response(`${error.message} Envía los campos de nuevo.`,
    "action-guidance", fieldsDraft(file)); throw error; }
  const draft = { type: "FILE_EVIDENCE_CREATE", data: parsed.fields,
    source: sourceKey(file), operationId: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de vincular el archivo privado «${file.name}» (${file.file.size} bytes):\nTítulo: ${data.title}\nDescripción: ${data.description}\nTipo: ${data.evidenceType}\nExpediente: ${data.entityType} ${data.entityTitle} (${data.entityId}).\nVERA guardará una copia privada independiente. Escribe «Confirmar archivo como evidencia» en los próximos cinco minutos; otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isFileEvidenceCommand, parseFields, sourceFor, handleFileEvidence };
