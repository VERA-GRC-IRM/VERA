const riskRepository = require("../repositories/riskRepository");
const userRepository = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { parseAssessment, evaluateRiskForUser } = require("./riskEvaluationService");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const confirm = (question) => /^(confirmar evaluaci[oó]n|confirmo la evaluaci[oó]n)$/i.test(question.trim());
const intent = (question) => /^(?:eval[uú]a|evaluar)\s+(?:el\s+)?riesgo\b/i.test(question);
const parseRiskCommand = (question) => {
  const match = question.match(/^(?:eval[uú]a|evaluar)\s+(?:el\s+)?riesgo\s+(?:[«“"](.+?)[»”"]|(RSK-[a-z0-9-]+))\s+con\s+probabilidad\s+([1-3])\s+(?:e|y)\s+impacto\s+([1-3])\s+porque\s+(.+)$/i);
  if (!match) return null;
  return { target: (match[1] || match[2]).trim(), likelihood: Number(match[3]),
    impact: Number(match[4]), note: match[5].trim() };
};
const isRiskCommand = (question) => intent(question) || confirm(question);

const handleRiskEvaluation = async (user, question, thread) => {
  if (!isRiskCommand(question, thread)) return null;
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar riesgos, pero no evaluarlos.");
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "RISK_EVALUATION") {
      return response("No hay una evaluación pendiente. Pide una nueva vista previa del riesgo antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Solicita la evaluación de nuevo.");
    const record = await riskRepository.findById(draft.id);
    if (!record || record.storageVersion !== draft.version ||
        record.evaluations.length !== draft.evaluationsCount) {
      return response("El riesgo cambió desde la vista previa. Revísalo antes de pedir la evaluación de nuevo.");
    }
    const risk = await evaluateRiskForUser(user, draft.id, draft.assessment, draft.version);
    return response(`Quedó evaluado «${risk.title}»: ${risk.level} (${risk.score}/9). La justificación, responsable y fecha se registraron en la bitácora.`,
      "action-executed", { actionOutcome: { id: risk.id, level: risk.level, score: risk.score } });
  }
  const command = parseRiskCommand(question);
  if (!command || command.target.length > 140) {
    return response("Indica el riesgo exacto, los factores y una justificación. Ejemplo: Evalúa el riesgo «Acceso indebido» con probabilidad 3 e impacto 2 porque la exposición afecta varios procesos.");
  }
  const assessment = parseAssessment(command);
  if (assessment.error) return response(assessment.error);
  const matches = (await visibleCollectionsForUser(user)).RISK.filter((item) =>
    normalize(item.title) === normalize(command.target) || normalize(item.id) === normalize(command.target));
  if (matches.length !== 1) {
    return response(matches.length > 1
      ? `Hay varios riesgos con ese título. Repite la instrucción con un identificador: ${matches.slice(0, 5).map((item) => item.id).join(", ")}.`
      : "No encontré ese riesgo. Comprueba el título o identificador exacto.");
  }
  const record = matches[0];
  const draft = { type: "RISK_EVALUATION", id: record.id, version: record.storageVersion,
    evaluationsCount: record.evaluations.length, assessment: { likelihood: command.likelihood,
      impact: command.impact, note: assessment.data.note },
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de ejecutar: evaluar «${record.title}» (${record.id}) con probabilidad ${command.likelihood} e impacto ${command.impact}. Resultado: ${assessment.data.level} (${assessment.data.score}/9). Justificación: ${assessment.data.note}. Escribe «Confirmar evaluación» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isRiskCommand, parseRiskCommand, handleRiskEvaluation };
