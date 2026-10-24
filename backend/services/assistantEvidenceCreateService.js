const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const { RECORD_CREATE_ROLES } = require("../config/roles");
const { parseEvidence } = require("./evidenceCreationService");
const { canReplayEvidence } = require("./creationReplayScope");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:registra|registrar|crea|crear)\s+(?:una\s+)?evidencia(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar evidencia|confirmo la evidencia)$/i.test(question.trim());
const isEvidenceCreateCommand = (question, thread) => intent(question) || confirm(question) ||
  thread.messages.at(-1)?.actionDraft?.type === "EVIDENCE_FIELDS" && /^t[ií]tulo\s*:/i.test(question.trim());
const FIELD_NAMES = { titulo: "title", descripcion: "description", tipo: "evidenceType",
  referencia: "reference", entidad: "entityType", identificador: "entityId" };
const TYPES = { documento: "DOCUMENT", captura: "SCREENSHOT", reporte: "REPORT", otro: "OTHER" };
const ENTITIES = { riesgo: "RISK", control: "CONTROL", auditoria: "AUDIT" };
const template = `Para registrar una referencia de evidencia, envía estos campos en un solo mensaje (uno por línea):\nTítulo: Acta de revisión\nDescripción: Documento que respalda la revisión del proceso auditado\nTipo: documento\nReferencia: https://ejemplo.com/acta\nEntidad: riesgo\nIdentificador: RSK-...\nUsa el identificador exacto de un riesgo, control o auditoría que puedas consultar. La carga de archivos privados permanece en su flujo específico.`;
const fieldsDraft = () => ({ actionDraft: {
  type: "EVIDENCE_FIELDS", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } });

const parseFields = (question) => {
  const lines = question.trim().split(/\r?\n/);
  if (intent(lines[0])) lines.shift();
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]{1,30}):\s*(.{1,800})$/);
    const key = match && FIELD_NAMES[normalize(match[1])];
    if (!key || Object.hasOwn(fields, key)) return { error: "Usa una línea por campo, sin repetirlos: Título, Descripción, Tipo, Referencia, Entidad e Identificador." };
    fields[key] = match[2].trim();
  }
  if (Object.values(FIELD_NAMES).some((key) => !fields[key])) {
    return { error: "Faltan campos: Título, Descripción, Tipo, Referencia, Entidad e Identificador." };
  }
  fields.evidenceType = TYPES[normalize(fields.evidenceType)] || fields.evidenceType.toUpperCase();
  fields.entityType = ENTITIES[normalize(fields.entityType)] || fields.entityType.toUpperCase();
  return { fields };
};

const handleEvidenceCreate = async (user, question, thread) => {
  if (!isEvidenceCreateCommand(question, thread)) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RECORD_CREATE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar evidencias, pero no registrarlas.");
  }
  if (confirm(question)) {
    const reservation = thread.messages.at(-1)?.actionReservation;
    if (reservation?.type === "EVIDENCE_CREATE") {
      if (!reservation.data) return response("La confirmación anterior ya no está disponible. Solicita una vista previa nueva.");
      let data;
      try { data = await parseEvidence(user, reservation.data); }
      catch (error) { if (error.status) return response("El expediente ya no está disponible. Solicita una vista previa nueva."); throw error; }
      const existing = (await evidenceRepository.getAll()).find((item) => item.aiOperationId === reservation.operationId);
      return existing && canReplayEvidence(existing, user, data) && !existing.file
        ? response(`La evidencia «${existing.title}» ya quedó registrada con identificador ${existing.id}.`,
          "action-executed", { actionOutcome: { id: existing.id } })
        : Date.now() - Date.parse(reservation.createdAt) < 120_000
          ? response("La confirmación sigue en curso. Espera unos segundos y consulta de nuevo.", "action-pending")
          : response("No hay constancia del registro. Solicita una vista previa nueva antes de intentarlo otra vez.");
    }
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "EVIDENCE_CREATE") {
      return response("No hay una evidencia pendiente. Pide una vista previa nueva antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara la evidencia de nuevo.");
    return response("Reservando el registro de la evidencia.", "action-reservation", { evidenceCreate: draft });
  }
  const raw = question.trim();
  if (intent(raw) && !raw.includes("\n")) return response(template, "action-guidance", fieldsDraft());
  const pending = thread.messages.at(-1)?.actionDraft;
  if (!intent(raw) && (!pending || pending.type !== "EVIDENCE_FIELDS" || Date.parse(pending.expiresAt) < Date.now())) {
    return response("El formulario conversacional venció. Escribe «Registrar evidencia» para empezar de nuevo.");
  }
  const parsed = parseFields(raw);
  if (parsed.error) return response(`${parsed.error}\n${template}`, "action-guidance", fieldsDraft());
  let data;
  try { data = await parseEvidence(user, parsed.fields); }
  catch (error) { if (error.status) return response(`${error.message} Envía los campos de nuevo.`,
    "action-guidance", fieldsDraft()); throw error; }
  const draft = { type: "EVIDENCE_CREATE", data: parsed.fields, operationId: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de registrar la evidencia:\nTítulo: ${data.title}\nDescripción: ${data.description}\nTipo: ${data.evidenceType}\nReferencia: ${data.reference}\nRelacionada con: ${data.entityType} ${data.entityTitle} (${data.entityId}).\nEscribe «Confirmar evidencia» en los próximos cinco minutos; otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isEvidenceCreateCommand, parseFields, handleEvidenceCreate };
