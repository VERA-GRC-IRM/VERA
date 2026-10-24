const findingRepository = require("../repositories/findingRepository");
const controlRepository = require("../repositories/controlRepository");
const riskRepository = require("../repositories/riskRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope, assertNewRelationUnscoped } = require("./recordWriteScopeService");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const text = (value) => String(value ?? "").trim();

const prepareFinding = async (user, input, expectedControlVersion) => {
  const controlId = text(input.controlId);
  const riskId = text(input.riskId);
  const title = text(input.title);
  const description = text(input.description);
  if (!controlId || !riskId) throw errorFor("Selecciona un control y uno de sus riesgos vinculados.", 400);
  if (title.length < 3 || title.length > 120) throw errorFor("El título debe tener entre 3 y 120 caracteres.", 400);
  if (description.length < 10 || description.length > 2000) {
    throw errorFor("La descripción debe tener entre 10 y 2,000 caracteres.", 400);
  }
  const control = await controlRepository.findById(controlId);
  if (!control || !control.riskIds.includes(riskId)) {
    throw errorFor("No existe esa relación entre control y riesgo.", 404);
  }
  const risk = await riskRepository.findById(riskId);
  if (!risk) throw errorFor("Riesgo no encontrado.", 404);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) &&
      !(user.role === ROLES.AUDITOR && risk.ownerId === user.id)) {
    throw errorFor("No puedes registrar hallazgos para este riesgo.", 403);
  }
  await assertWritableSourceScope(user, "RISK", risk);
  await assertWritableSourceScope(user, "CONTROL", control);
  assertNewRelationUnscoped(risk);
  assertNewRelationUnscoped(control);
  if (control.effectiveness >= 4) {
    throw errorFor("Solo se puede abrir un hallazgo desde un control con efectividad insuficiente (1–3).", 409);
  }
  if (expectedControlVersion !== undefined && control.evaluations.length !== expectedControlVersion) {
    throw errorFor("La evaluación del control cambió desde la vista previa. Revísala de nuevo.", 409);
  }
  const duplicate = (await findingRepository.getAll()).some((item) =>
    item.controlId === controlId && item.riskId === riskId &&
    item.evaluationVersion === control.evaluations.length);
  if (duplicate) throw errorFor("Ya existe un hallazgo para este riesgo y evaluación del control.", 409);
  return { title, description, control, risk };
};

const createFindingForUser = async (user, input, operationId = null, expectedControlVersion) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  if (operationId) {
    const existing = (await findingRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      await assertWritableSourceScope(user, "FINDING", existing);
      return existing;
    }
  }
  const { title, description, control, risk } = await prepareFinding(user, input, expectedControlVersion);
  const finding = await findingRepository.create({ title, description,
    controlId: control.id, controlTitle: control.title,
    riskId: risk.id, riskTitle: risk.title, auditId: risk.linkedAuditId || null,
    proposalId: risk.linkedAuditId || null, evaluationVersion: control.evaluations.length,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, username: user.username, role: user.role } });
  await logActivity({ actor: user, action: "FINDING_REGISTERED", details: {
    findingId: finding.id, controlId: control.id, riskId: risk.id, auditId: finding.auditId } });
  return finding;
};

module.exports = { prepareFinding, createFindingForUser };
