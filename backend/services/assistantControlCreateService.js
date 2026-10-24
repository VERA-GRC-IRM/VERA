const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { activeUsers, parseCore } = require("./controlCreationService");
const { parseEvaluation, resultFor } = require("./controlEvaluationService");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:registra|registrar|crea|crear)\s+(?:un\s+)?control(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar control nuevo|confirmo el control nuevo)$/i.test(question.trim());
const isControlCreateCommand = (question, thread) => intent(question) || confirm(question) ||
  thread.messages.at(-1)?.actionDraft?.type === "CONTROL_FIELDS" && /^t[ií]tulo\s*:/i.test(question.trim());
const FIELD_NAMES = { titulo: "title", descripcion: "description", tipo: "type",
  frecuencia: "frequency", riesgos: "risks", efectividad: "rating",
  justificacion: "note", responsable: "owner" };
const TYPE_MAP = { preventivo: "PREVENTIVE", detectivo: "DETECTIVE", correctivo: "CORRECTIVE" };
const FREQUENCY_MAP = { diaria: "Daily", semanal: "Weekly", mensual: "Monthly",
  trimestral: "Quarterly", anual: "Annually" };
const FIELD_LABELS = "Título, Descripción, Tipo, Frecuencia, Riesgos, Efectividad y Justificación";
const template = `Para registrar un control, envía estos campos en un solo mensaje (uno por línea):\nTítulo: Revisión mensual de accesos\nDescripción: El responsable comprueba permisos activos y documenta excepciones\nTipo: Preventivo\nFrecuencia: Mensual\nRiesgos: RSK-001\nEfectividad: 4\nJustificación: La revisión cubre todos los accesos del periodo\nPuedes añadir «Responsable:» con el nombre exacto de una cuenta activa; si lo omites, quedas tú. Separa con comas los riesgos si son varios. Tipos: Preventivo, Detectivo o Correctivo. Frecuencias: Diaria, Semanal, Mensual, Trimestral o Anual.`;

const parseFields = (question) => {
  const lines = question.trim().split(/\r?\n/);
  if (intent(lines[0])) lines.shift();
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([^:]{1,30}):\s*(.{1,2000})$/);
    const key = match && FIELD_NAMES[normalize(match[1])];
    if (!key || Object.hasOwn(fields, key)) {
      return { error: `Usa una línea por campo, sin repetirlos. Campos admitidos: ${FIELD_LABELS}; Responsable es opcional.` };
    }
    fields[key] = match[2].trim();
  }
  if (["title", "description", "type", "frequency", "risks", "rating", "note"].some((key) => !fields[key])) {
    return { error: `Faltan campos. Indica ${FIELD_LABELS}.` };
  }
  return { fields };
};
const fieldsDraft = () => ({ actionDraft: {
  type: "CONTROL_FIELDS", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } });

const handleControlCreate = async (user, question, thread) => {
  if (!isControlCreateCommand(question, thread)) return null;
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar controles, pero no registrarlos.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "CONTROL_CREATE") {
      return response("No hay un control pendiente. Pide una vista previa nueva antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara el control de nuevo.");
    return response("Reservando el registro del control.", "action-reservation", { controlCreate: draft });
  }
  const raw = question.trim();
  if (intent(raw) && !raw.includes("\n")) return response(template, "action-guidance", fieldsDraft());
  const pending = thread.messages.at(-1)?.actionDraft;
  if (!intent(raw) && (!pending || pending.type !== "CONTROL_FIELDS" || Date.parse(pending.expiresAt) < Date.now())) {
    return response("El formulario conversacional venció. Escribe «Registrar control» para empezar de nuevo.");
  }
  const parsed = parseFields(raw);
  if (parsed.error) return response(`${parsed.error}\n${template}`, "action-guidance", fieldsDraft());
  const fields = parsed.fields;
  const type = TYPE_MAP[normalize(fields.type)];
  const frequency = FREQUENCY_MAP[normalize(fields.frequency)];
  if (!type || !frequency || !/^[1-5]$/.test(fields.rating)) {
    return response("Usa un tipo y una frecuencia de la plantilla, y efectividad entera de 1 a 5. Envía los campos de nuevo.",
      "action-guidance", fieldsDraft());
  }
  const possibleOwners = (await activeUsers()).filter((item) => [item.name, item.username, String(item.id)]
    .some((value) => normalize(value) === normalize(fields.owner || currentUser.name)));
  if (possibleOwners.length !== 1) {
    return response("No identifiqué una única cuenta activa como responsable. Indica nombre o cuenta exacta y envía los campos de nuevo.",
      "action-guidance", fieldsDraft());
  }
  const risks = (await visibleCollectionsForUser(user)).RISK;
  const requested = fields.risks.split(",").map((item) => normalize(item)).filter(Boolean);
  if (requested.length === 0 || requested.length > 10 || new Set(requested).size !== requested.length) {
    return response("Indica de uno a diez riesgos distintos, separados por comas. Envía los campos de nuevo.",
      "action-guidance", fieldsDraft());
  }
  const matches = requested.map((item) => risks.filter((risk) =>
    [risk.id, risk.title].some((value) => normalize(value) === item)));
  if (matches.some((items) => items.length !== 1) ||
      new Set(matches.map(([risk]) => risk.id)).size !== matches.length) {
    return response("Algún riesgo no existe o su nombre no es único. Consulta los riesgos y usa sus identificadores exactos.",
      "action-guidance", fieldsDraft());
  }
  const input = { ...fields, type, frequency, ownerId: possibleOwners[0].id,
    riskIds: matches.map(([risk]) => risk.id) };
  const core = await parseCore(input);
  const evaluation = parseEvaluation(input);
  if (core.error || evaluation.error) {
    return response(`${core.error || evaluation.error} Envía los campos de nuevo.`, "action-guidance", fieldsDraft());
  }
  const draft = { type: "CONTROL_CREATE", data: input, operationId: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de registrar el control:\nTítulo: ${core.data.title}\nDescripción: ${core.data.description}\nTipo: ${fields.type}\nFrecuencia: ${fields.frequency}\nRiesgos: ${core.data.riskIds.join(", ")}\nResponsable: ${core.data.ownerName}\nEfectividad inicial: ${evaluation.data.rating}/5 (${resultFor(evaluation.data.rating) === "EFFECTIVE" ? "efectivo" : "inefectivo"}).\nJustificación: ${evaluation.data.note}\nEscribe «Confirmar control nuevo» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
  "action-preview", { actionDraft: draft });
};

module.exports = { isControlCreateCommand, parseFields, handleControlCreate };
