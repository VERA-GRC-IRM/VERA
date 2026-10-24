const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { prepareFinding } = require("./findingCreationService");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:registra|registrar|crea|crear)\s+(?:un\s+)?hallazgo(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar hallazgo|confirmo el hallazgo)$/i.test(question.trim());
const isFindingCreateCommand = (question, thread) => intent(question) || confirm(question) ||
  thread.messages.at(-1)?.actionDraft?.type === "FINDING_FIELDS" && /^t[ií]tulo\s*:/i.test(question.trim());
const FIELD_NAMES = { titulo: "title", descripcion: "description", control: "control", riesgo: "risk" };
const FIELD_LABELS = "Título, Descripción, Control y Riesgo";
const template = `Para registrar un hallazgo, envía estos campos en un solo mensaje (uno por línea):\nTítulo: Revisión de accesos incompleta\nDescripción: El control no cubrió todos los accesos y requiere seguimiento\nControl: CTL-001\nRiesgo: RSK-001\nEl control debe estar vinculado a ese riesgo y tener efectividad insuficiente (1–3). Puedes usar el identificador exacto o un título único. En caso de duda, consulta primero controles y riesgos en el chat.`;

const parseFields = (question) => {
  const lines = question.trim().split(/\r?\n/);
  if (intent(lines[0])) lines.shift();
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]{1,30}):\s*(.{1,2000})$/);
    const key = match && FIELD_NAMES[normalize(match[1])];
    if (!key || Object.hasOwn(fields, key)) {
      return { error: `Usa una línea por campo, sin repetirlos. Campos admitidos: ${FIELD_LABELS}.` };
    }
    fields[key] = match[2].trim();
  }
  if (["title", "description", "control", "risk"].some((key) => !fields[key])) {
    return { error: `Faltan campos. Indica ${FIELD_LABELS}.` };
  }
  return { fields };
};
const fieldsDraft = () => ({ actionDraft: {
  type: "FINDING_FIELDS", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } });
const resolveOne = async (rows, target) => {
  const matches = rows.filter((item) => [item.id, item.title]
    .some((value) => normalize(value) === normalize(target)));
  return matches.length === 1 ? matches[0] : null;
};

const handleFindingCreate = async (user, question, thread) => {
  if (!isFindingCreateCommand(question, thread)) return null;
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) && user.role !== ROLES.AUDITOR) {
    return response("Tu rol puede consultar hallazgos, pero no registrarlos.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "FINDING_CREATE") {
      return response("No hay un hallazgo pendiente. Pide una vista previa nueva antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara el hallazgo de nuevo.");
    return response("Reservando el registro del hallazgo.", "action-reservation", { findingCreate: draft });
  }
  const raw = question.trim();
  if (intent(raw) && !raw.includes("\n")) return response(template, "action-guidance", fieldsDraft());
  const pending = thread.messages.at(-1)?.actionDraft;
  if (!intent(raw) && (!pending || pending.type !== "FINDING_FIELDS" || Date.parse(pending.expiresAt) < Date.now())) {
    return response("El formulario conversacional venció. Escribe «Registrar hallazgo» para empezar de nuevo.");
  }
  const parsed = parseFields(raw);
  if (parsed.error) return response(`${parsed.error}\n${template}`, "action-guidance", fieldsDraft());
  const fields = parsed.fields;
  const visible = await visibleCollectionsForUser(user);
  const control = await resolveOne(visible.CONTROL, fields.control);
  const risk = await resolveOne(visible.RISK, fields.risk);
  if (!control || !risk) {
    return response("No encontré un único control y riesgo con esos nombres o identificadores. Usa sus identificadores exactos.",
      "action-guidance", fieldsDraft());
  }
  const input = { title: fields.title, description: fields.description,
    controlId: control.id, riskId: risk.id };
  let prepared;
  try { prepared = await prepareFinding(user, input); }
  catch (error) { if (error.status) return response(`${error.message} Envía los campos de nuevo.`,
    "action-guidance", fieldsDraft()); throw error; }
  const draft = { type: "FINDING_CREATE", data: input,
    controlEvaluationVersion: prepared.control.evaluations.length,
    operationId: randomUUID(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de registrar el hallazgo:\nTítulo: ${prepared.title}\nDescripción: ${prepared.description}\nControl: ${control.title} (${control.id}), efectividad ${control.effectiveness}/5, evaluación ${draft.controlEvaluationVersion}.\nRiesgo: ${risk.title} (${risk.id}).\nAuditoría relacionada: ${risk.linkedAuditId || "ninguna"}.\nEscribe «Confirmar hallazgo» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isFindingCreateCommand, parseFields, handleFindingCreate };
