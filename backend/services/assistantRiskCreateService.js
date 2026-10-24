const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const riskRepository = require("../repositories/riskRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { activeUsers, parseCore } = require("./riskCreationService");
const { parseAssessment } = require("./riskEvaluationService");
const { assertWritableRiskAuditLink } = require("./recordWriteScopeService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:registra|registrar|crea|crear)\s+(?:un\s+)?riesgo(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar riesgo|confirmo el riesgo)$/i.test(question.trim());
const isRiskCreateCommand = (question, thread) => intent(question) || confirm(question) ||
  thread.messages.at(-1)?.actionDraft?.type === "RISK_FIELDS" && /^t[ií]tulo\s*:/i.test(question.trim());
const FIELD_NAMES = { titulo: "title", descripcion: "description", area: "area",
  probabilidad: "likelihood", impacto: "impact", justificacion: "note",
  responsable: "owner", auditoria: "linkedAuditId", plan: "responsePlan" };
const FIELD_LABELS = "Título, Descripción, Área, Probabilidad, Impacto y Justificación";
const UNAVAILABLE_AUDIT = "La auditoría relacionada no está disponible para este vínculo. Comprueba el ID, el ámbito y tu acceso; envía los campos de nuevo.";
const template = `Para registrar un riesgo, envía estos campos en un solo mensaje (uno por línea):\nTítulo: Accesos sin revisión\nDescripción: Los permisos antiguos pueden dar acceso indebido a información\nÁrea: Operaciones\nProbabilidad: 2\nImpacto: 3\nJustificación: Se observaron cuentas sin revisión durante el trimestre\nOpcional: «Responsable:» con nombre exacto de una cuenta activa; si lo omites, quedas tú. Puedes añadir «Auditoría:» con identificador exacto existente y «Plan:» con una acción de respuesta.`;

const parseFields = (question) => {
  const lines = question.trim().split(/\r?\n/);
  if (intent(lines[0])) lines.shift();
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]{1,30}):\s*(.{1,2000})$/);
    const key = match && FIELD_NAMES[normalize(match[1])];
    if (!key || Object.hasOwn(fields, key)) {
      return { error: `Usa una línea por campo, sin repetirlos. Campos admitidos: ${FIELD_LABELS}; Responsable, Auditoría y Plan opcionales.` };
    }
    fields[key] = match[2].trim();
  }
  if (["title", "description", "area", "likelihood", "impact", "note"].some((key) => !fields[key])) {
    return { error: `Faltan campos. Indica ${FIELD_LABELS}.` };
  }
  return { fields };
};
const fieldsDraft = () => ({ actionDraft: {
  type: "RISK_FIELDS", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } });

const handleRiskCreate = async (user, question, thread) => {
  if (!isRiskCreateCommand(question, thread)) return null;
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar riesgos, pero no registrarlos.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "RISK_CREATE") {
      return response("No hay un riesgo pendiente. Pide una vista previa nueva antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara el riesgo de nuevo.");
    return response("Reservando el registro del riesgo.", "action-reservation", { riskCreate: draft });
  }
  const raw = question.trim();
  if (intent(raw) && !raw.includes("\n")) return response(template, "action-guidance", fieldsDraft());
  const pending = thread.messages.at(-1)?.actionDraft;
  if (!intent(raw) && (!pending || pending.type !== "RISK_FIELDS" || Date.parse(pending.expiresAt) < Date.now())) {
    return response("El formulario conversacional venció. Escribe «Registrar riesgo» para empezar de nuevo.");
  }
  const parsed = parseFields(raw);
  if (parsed.error) return response(`${parsed.error}\n${template}`, "action-guidance", fieldsDraft());
  const fields = parsed.fields;
  if (!/^[1-3]$/.test(fields.likelihood) || !/^[1-3]$/.test(fields.impact)) {
    return response("Probabilidad e impacto deben ser números enteros de 1 a 3. Envía los campos de nuevo.",
      "action-guidance", fieldsDraft());
  }
  const possibleOwners = (await activeUsers()).filter((item) => [item.name, item.username, String(item.id)]
    .some((value) => normalize(value) === normalize(fields.owner || currentUser.name)));
  if (possibleOwners.length !== 1) {
    return response("No identifiqué una única cuenta activa como responsable. Indica nombre o cuenta exacta y envía los campos de nuevo.",
      "action-guidance", fieldsDraft());
  }
  const input = { ...fields, ownerId: possibleOwners[0].id };
  const core = await parseCore(input);
  const assessment = parseAssessment(input);
  if (core.error || assessment.error) {
    if (core.error === "La auditoría relacionada no existe.") {
      return response(UNAVAILABLE_AUDIT, "action-guidance", fieldsDraft());
    }
    return response(`${core.error || assessment.error} Envía los campos de nuevo.`, "action-guidance", fieldsDraft());
  }
  // A preview must observe the same link authorization as the final write.
  // Otherwise an inaccessible audit can be confirmed as existing in chat.
  try { await assertWritableRiskAuditLink(user, core.data); }
  catch (error) {
    if (!error.status) throw error;
    return response(UNAVAILABLE_AUDIT, "action-guidance", fieldsDraft());
  }
  if (await riskRepository.findDuplicate(core.data)) {
    return response("Ya existe un riesgo con el mismo nombre y área. Revisa el registro antes de continuar.");
  }
  const draft = { type: "RISK_CREATE", data: input, operationId: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de registrar el riesgo:\nTítulo: ${core.data.title}\nDescripción: ${core.data.description}\nÁrea: ${core.data.area}\nProbabilidad: ${assessment.data.likelihood}; impacto: ${assessment.data.impact}; nivel: ${assessment.data.level} (${assessment.data.score}/9).\nJustificación: ${assessment.data.note}\nResponsable: ${core.data.ownerName}\nAuditoría relacionada: ${core.data.linkedAuditId || "ninguna"}\nPlan: ${core.data.responsePlan || "sin definir"}.\nEscribe «Confirmar riesgo» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
  "action-preview", { actionDraft: draft });
};

module.exports = { isRiskCreateCommand, parseFields, handleRiskCreate };
