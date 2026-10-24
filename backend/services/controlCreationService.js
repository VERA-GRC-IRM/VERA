const controlRepository = require("../repositories/controlRepository");
const riskRepository = require("../repositories/riskRepository");
const userRepository = require("../repositories/userRepository");
const { logActivity } = require("./auditLogger");
const { USER_STATUS } = require("../config/accountRules");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { withResult, parseEvaluation } = require("./controlEvaluationService");
const { assertWritableControlScope } = require("./recordWriteScopeService");
const { UNAVAILABLE_RECORD } = require("./recordScopeVisibility");

const TYPES = ["PREVENTIVE", "DETECTIVE", "CORRECTIVE"];
const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Quarterly", "Annually"];
const text = (value) => String(value ?? "").trim();
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const activeUsers = async () => (await userRepository.getAll())
  .filter((user) => user.status === USER_STATUS.ACTIVE);

const parseCore = async (body) => {
  const title = text(body.title);
  const description = text(body.description);
  const type = text(body.type);
  const frequency = text(body.frequency);
  const owner = (await activeUsers()).find((user) => user.id === Number(body.ownerId));
  const rawRiskIds = Array.isArray(body.riskIds)
    ? [...new Set(body.riskIds.map((id) => text(id)).filter(Boolean))] : [];
  const risks = await riskRepository.getAll();
  if (title.length < 3 || title.length > 120) return { error: "El nombre debe tener entre 3 y 120 caracteres." };
  if (description.length < 10 || description.length > 1000) {
    return { error: "La descripción debe tener entre 10 y 1,000 caracteres." };
  }
  if (!TYPES.includes(type)) return { error: "Selecciona un tipo de control válido." };
  if (!FREQUENCIES.includes(frequency)) return { error: "Selecciona una frecuencia válida." };
  if (!owner) return { error: "Selecciona una persona responsable con cuenta activa." };
  if (rawRiskIds.length === 0) {
    return { error: "Relaciona el control con al menos un riesgo existente." };
  }
  if (rawRiskIds.some((id) => !risks.some((risk) => risk.id === id))) {
    return { error: UNAVAILABLE_RECORD, status: 404 };
  }
  return { data: { title, description, type, frequency,
    ownerId: owner.id, ownerName: owner.name, riskIds: rawRiskIds } };
};

const createControlForUser = async (user, input, operationId = null) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede registrar controles.", 403);
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  if (operationId) {
    const existing = (await controlRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      if (existing.createdBy?.id !== user.id) throw errorFor(UNAVAILABLE_RECORD, 404);
      await assertWritableControlScope(user, existing);
      return withResult(existing);
    }
  }
  const core = await parseCore(input);
  if (core.error) throw errorFor(core.error, core.status || 400);
  await assertWritableControlScope(user, core.data);
  const evaluation = parseEvaluation(input);
  if (evaluation.error) throw errorFor(evaluation.error, 400);
  const control = await controlRepository.create({ ...core.data,
    effectiveness: evaluation.data.rating, note: evaluation.data.note,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, username: user.username, role: user.role } });
  await logActivity({ actor: user, action: "CONTROL_REGISTERED",
    details: { controlId: control.id, title: control.title, riskIds: control.riskIds } });
  return withResult(control);
};

module.exports = { activeUsers, parseCore, createControlForUser };
