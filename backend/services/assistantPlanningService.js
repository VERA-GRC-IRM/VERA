const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { PLANNING_APPROVE_ROLES } = require("../config/roles");
const { applyTransition } = require("./planningTransitionService");
const { filterByVisibleScope, assertWritableRecordScope } = require("./recordScopeVisibility");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const confirm = (question) => /^(confirmar cambio|confirmo el cambio)$/i.test(question.trim());
const intent = (question) => /^(?:aprueba|aprobar|rechaza|rechazar)\s+(?:la\s+)?propuesta\b|^(?:inicia|iniciar|cierra|cerrar)\s+(?:la\s+)?auditor[ií]a\b/i.test(question);

const parsePlanningCommand = (question) => {
  const variants = [
    { operation: "approve", pattern: /^(?:aprueba|aprobar)\s+(?:la\s+)?propuesta\s+(?:[«“"](.+?)[»”"]|(AUD-[a-z0-9-]+))\s+(?:para|en)\s+(Q[1-4])\s+porque\s+(.+)$/i },
    { operation: "reject", pattern: /^(?:rechaza|rechazar)\s+(?:la\s+)?propuesta\s+(?:[«“"](.+?)[»”"]|(AUD-[a-z0-9-]+))\s+porque\s+(.+)$/i },
    { operation: "start", pattern: /^(?:inicia|iniciar)\s+(?:la\s+)?auditor[ií]a\s+(?:[«“"](.+?)[»”"]|(AUD-[a-z0-9-]+))\s+porque\s+(.+)$/i },
    { operation: "close", pattern: /^(?:cierra|cerrar)\s+(?:la\s+)?auditor[ií]a\s+(?:[«“"](.+?)[»”"]|(AUD-[a-z0-9-]+))\s+porque\s+(.+)$/i }
  ];
  for (const { operation, pattern } of variants) {
    const match = question.match(pattern);
    if (!match) continue;
    return { operation, target: (match[1] || match[2]).trim(),
      quarter: operation === "approve" ? match[3].toUpperCase() : null,
      note: (operation === "approve" ? match[4] : match[3]).trim() };
  }
  return null;
};

const isPlanningCommand = (question, thread) => intent(question) ||
  confirm(question) && thread.messages.at(-1)?.actionDraft?.type === "PLANNING_TRANSITION";

const handlePlanningTransition = async (user, question, thread) => {
  if (!isPlanningCommand(question, thread)) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!PLANNING_APPROVE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar propuestas y auditorías, pero no decidir ni cambiar su estado.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "PLANNING_TRANSITION") return null;
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Solicita la operación de nuevo.");
    const record = await planningRepository.findById(draft.id);
    if (!record || record.storageVersion !== draft.version || record.status !== draft.status) {
      return response("La propuesta o auditoría cambió desde la vista previa. Revísala antes de pedir la operación de nuevo.");
    }
    const { record: updated } = await applyTransition(user, draft.id, draft.operation,
      { quarter: draft.quarter, reason: draft.note, note: draft.note, version: draft.version });
    const verbs = { approve: "aprobada", reject: "rechazada", start: "iniciada", close: "cerrada" };
    return response(`Quedó ${verbs[draft.operation]} «${updated.title}». La decisión y su motivo se registraron en la bitácora.`,
      "action-executed", { actionOutcome: { id: updated.id, status: updated.status } });
  }
  const command = parsePlanningCommand(question);
  if (!command) {
    return response("Indica la propuesta o auditoría exacta y el motivo. Ejemplos: Aprueba la propuesta «Auditoría de accesos» para Q4 porque cumple los criterios; Rechaza la propuesta «Auditoría de accesos» porque falta alcance; Inicia la auditoría «Auditoría de accesos» porque comenzó el periodo; Cierra la auditoría «Auditoría de accesos» porque terminó la revisión.");
  }
  if (command.target.length > 140 || command.note.length < 10 || command.note.length > 1000) {
    return response("Indica un título o ID exacto y un motivo de 10 a 1,000 caracteres.");
  }
  const matches = (await filterByVisibleScope(user, await planningRepository.getAll())).filter((item) =>
    normalize(item.title) === normalize(command.target) || normalize(item.id) === normalize(command.target));
  if (matches.length !== 1) {
    return response(matches.length > 1
      ? `Hay varias auditorías con ese título. Repite la instrucción con un identificador: ${matches.slice(0, 5).map((item) => item.id).join(", ")}.`
      : "No encontré esa propuesta o auditoría en tu alcance. Comprueba el título o identificador exacto.");
  }
  const record = matches[0];
  await assertWritableRecordScope(user, record);
  const valid = ["approve", "reject"].includes(command.operation) ? record.status === "OPEN"
    : command.operation === "start" ? record.status === "APPROVED" : record.status === "ACTIVE";
  if (!valid) return response("El estado actual no permite esa operación. Consulta el expediente y solicita la transición correspondiente.");
  const draft = { type: "PLANNING_TRANSITION", id: record.id, status: record.status,
    version: record.storageVersion, operation: command.operation, quarter: command.quarter,
    note: command.note, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  const label = { approve: "aprobar", reject: "rechazar", start: "iniciar", close: "cerrar" }[command.operation];
  return response(`Revisa antes de ejecutar: ${label} «${record.title}» (${record.id})${command.quarter ? ` para ${command.quarter}` : ""}. Motivo: ${command.note}. Escribe «Confirmar cambio» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isPlanningCommand, parsePlanningCommand, handlePlanningTransition };
