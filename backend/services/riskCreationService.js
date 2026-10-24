const riskRepository = require("../repositories/riskRepository");
const userRepository = require("../repositories/userRepository");
const planningRepository = require("../repositories/planningRepository");
const { logActivity } = require("./auditLogger");
const { USER_STATUS } = require("../config/accountRules");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { parseAssessment } = require("./riskEvaluationService");
const { assertWritableRecordScope, assertWritableRiskAuditLink } = require("./recordWriteScopeService");
const { UNAVAILABLE_RECORD } = require("./recordScopeVisibility");

const text = (value) => String(value ?? "").trim();
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const activeUsers = async () => (await userRepository.getAll())
  .filter((user) => user.status === USER_STATUS.ACTIVE);

const parseCore = async (body) => {
  const title = text(body.title);
  const description = text(body.description);
  const area = text(body.area);
  const responsePlan = text(body.responsePlan);
  const ownerId = Number(body.ownerId);
  const owner = (await activeUsers()).find((user) => user.id === ownerId);
  const linkedAuditId = text(body.linkedAuditId);
  if (title.length < 3 || title.length > 140) return { error: "El nombre debe tener entre 3 y 140 caracteres." };
  if (description.length < 10 || description.length > 2000) {
    return { error: "La descripción debe tener entre 10 y 2,000 caracteres." };
  }
  if (!area || area.length > 100) return { error: "El área es obligatoria y admite hasta 100 caracteres." };
  if (!owner) return { error: "Selecciona una persona responsable con cuenta activa." };
  if (responsePlan.length > 2000) return { error: "El plan de respuesta admite hasta 2,000 caracteres." };
  if (linkedAuditId && !await planningRepository.findById(linkedAuditId)) {
    return { error: "La auditoría relacionada no existe." };
  }
  return { data: { title, description, area, ownerId: owner.id,
    ownerName: owner.name, responsePlan, linkedAuditId: linkedAuditId || null } };
};

const createRiskForUser = async (user, input, operationId = null) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede registrar riesgos.", 403);
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  if (operationId) {
    const existing = (await riskRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      await assertWritableRecordScope(user, existing);
      await assertWritableRiskAuditLink(user, existing);
      return existing;
    }
  }
  const core = await parseCore(input);
  if (core.error) throw core.error === "La auditoría relacionada no existe."
    ? errorFor(UNAVAILABLE_RECORD, 404) : errorFor(core.error, 400);
  await assertWritableRiskAuditLink(user, core.data);
  const assessment = parseAssessment(input);
  if (assessment.error) throw errorFor(assessment.error, 400);
  if (await riskRepository.findDuplicate(core.data)) {
    throw errorFor("Ya existe un riesgo con el mismo nombre y área.", 409);
  }
  const risk = await riskRepository.create({ ...core.data, ...assessment.data,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, name: user.username } });
  await logActivity({ actor: user, action: "RISK_REGISTERED",
    details: { riskId: risk.id, title: risk.title, level: risk.level, score: risk.score } });
  return risk;
};

module.exports = { activeUsers, parseCore, createRiskForUser };
