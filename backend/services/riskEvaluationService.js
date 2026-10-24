const riskRepository = require("../repositories/riskRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { classifyRisk } = require("../config/riskRules");
const { LEGACY_RISK_METHOD_ID, UNSPECIFIED_STAGE } = require("../config/riskMethods");
const { logActivity } = require("./auditLogger");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const parseAssessment = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Envía una evaluación válida." };
  }
  if (body.methodId !== undefined && body.methodId !== LEGACY_RISK_METHOD_ID) {
    return { error: "La metodología solicitada no está habilitada." };
  }
  if (body.assessmentStage !== undefined && body.assessmentStage !== UNSPECIFIED_STAGE) {
    return { error: "Esta metodología aún no distingue riesgo inherente, residual u objetivo." };
  }
  const likelihood = Number(body.likelihood);
  const impact = Number(body.impact);
  const note = String(body.note ?? "").trim();
  if (![1, 2, 3].includes(likelihood) || ![1, 2, 3].includes(impact)) {
    return { error: "La probabilidad y el impacto deben ser valores enteros de 1 a 3." };
  }
  if (note.length < 10 || note.length > 1000) {
    return { error: "La justificación debe tener entre 10 y 1,000 caracteres." };
  }
  const score = likelihood * impact;
  return { data: { likelihood, impact, score, level: classifyRisk(score), note,
    methodId: LEGACY_RISK_METHOD_ID, assessmentStage: UNSPECIFIED_STAGE } };
};

const evaluateRiskForUser = async (user, id, body, expectedVersion) => {
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede evaluar riesgos.", 403);
  if (typeof id !== "string" || !id.trim() || id.length > 80) throw errorFor("Selecciona un riesgo válido.", 400);
  const current = await riskRepository.findById(id);
  if (!current) throw errorFor("Riesgo no encontrado.", 404);
  const assessment = parseAssessment(body);
  if (assessment.error) throw errorFor(assessment.error, 400);
  if (expectedVersion !== undefined && current.storageVersion !== expectedVersion) {
    throw errorFor("El riesgo cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  const risk = await riskRepository.evaluate(current.id, {
    ...assessment.data, assessedBy: { id: user.id, name: user.username }
  }, current.storageVersion);
  await logActivity({ actor: user, action: "RISK_EVALUATED",
    details: { riskId: risk.id, title: risk.title, level: risk.level,
      score: risk.score, evaluationVersion: risk.evaluations.length } });
  return risk;
};

module.exports = { parseAssessment, evaluateRiskForUser };
