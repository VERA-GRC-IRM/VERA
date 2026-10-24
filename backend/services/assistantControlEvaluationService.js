const controlRepository = require("../repositories/controlRepository");
const userRepository = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { parseEvaluation, evaluateControlForUser, resultFor } = require("./controlEvaluationService");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const confirm = (question) => /^(confirmar control|confirmo el control)$/i.test(question.trim());
const intent = (question) => /^(?:eval[uú]a|evaluar)\s+(?:el\s+)?control\b/i.test(question);
const parseControlCommand = (question) => {
  const match = question.match(/^(?:eval[uú]a|evaluar)\s+(?:el\s+)?control\s+(?:[«“"](.+?)[»”"]|(CTL-[a-z0-9-]+))\s+con\s+(?:efectividad|calificaci[oó]n)\s+([1-5])\s+porque\s+(.+)$/i);
  if (!match) return null;
  return { target: (match[1] || match[2]).trim(), rating: Number(match[3]), note: match[4].trim() };
};
const isControlCommand = (question) => intent(question) || confirm(question);

const handleControlEvaluation = async (user, question, thread) => {
  if (!isControlCommand(question)) return null;
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar controles, pero no evaluarlos.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "CONTROL_EVALUATION") {
      return response("No hay una evaluación de control pendiente. Pide una nueva vista previa antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Solicita la evaluación de nuevo.");
    const record = await controlRepository.findById(draft.id);
    if (!record || record.storageVersion !== draft.version ||
        record.evaluations.length !== draft.evaluationsCount) {
      return response("El control cambió desde la vista previa. Revísalo antes de pedir la evaluación de nuevo.");
    }
    const control = await evaluateControlForUser(user, draft.id, draft.evaluation, draft.version);
    const label = control.effectivenessResult === "EFFECTIVE" ? "efectivo" : "inefectivo";
    return response(`Quedó evaluado «${control.title}»: ${label} (${control.effectiveness}/5). La justificación, responsable y fecha se registraron en la bitácora.${label === "inefectivo" ? " Puedes abrir un hallazgo vinculado al control y al riesgo desde el flujo correspondiente." : ""}`,
      "action-executed", { actionOutcome: { id: control.id, result: control.effectivenessResult,
        rating: control.effectiveness } });
  }
  const command = parseControlCommand(question);
  if (!command || command.target.length > 120) {
    return response("Indica el control exacto, la calificación y una justificación. Ejemplo: Evalúa el control «Conciliación mensual» con efectividad 2 porque la evidencia del trimestre mostró varias excepciones.");
  }
  const evaluation = parseEvaluation(command);
  if (evaluation.error) return response(evaluation.error);
  const matches = (await visibleCollectionsForUser(user)).CONTROL.filter((item) =>
    normalize(item.title) === normalize(command.target) || normalize(item.id) === normalize(command.target));
  if (matches.length !== 1) {
    return response(matches.length > 1
      ? `Hay varios controles con ese título. Repite la instrucción con un identificador: ${matches.slice(0, 5).map((item) => item.id).join(", ")}.`
      : "No encontré ese control. Comprueba el título o identificador exacto.");
  }
  const record = matches[0];
  const label = resultFor(command.rating) === "EFFECTIVE" ? "efectivo" : "inefectivo";
  const draft = { type: "CONTROL_EVALUATION", id: record.id, version: record.storageVersion,
    evaluationsCount: record.evaluations.length,
    evaluation: { rating: command.rating, note: evaluation.data.note },
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de ejecutar: evaluar «${record.title}» (${record.id}) con efectividad ${command.rating}/5. Resultado: ${label}. Justificación: ${evaluation.data.note}. Escribe «Confirmar control» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isControlCommand, parseControlCommand, handleControlEvaluation };
