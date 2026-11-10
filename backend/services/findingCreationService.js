const findingRepository = require("../repositories/findingRepository");
const controlRepository = require("../repositories/controlRepository");
const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES, RECORD_CREATE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope } = require("./recordWriteScopeService");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { USER_STATUS } = require("../config/accountRules");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const text = (value) => String(value ?? "").trim();
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const canCreateFindingForRisk = (user, risk) => RISK_CONTROL_MANAGE_ROLES.includes(user.role) ||
  (user.role === ROLES.AUDITOR && risk.ownerId === user.id);
const resolveRelations = async (input) => {
  let auditId = text(input.auditId);
  const riskId = text(input.riskId);
  const controlId = text(input.controlId);
  let audit = auditId ? await planningRepository.findById(auditId) : null;
  const risk = riskId ? await riskRepository.findById(riskId) : null;
  const control = controlId ? await controlRepository.findById(controlId) : null;
  if ((auditId && !audit) || (riskId && !risk) || (controlId && !control)) {
    throw errorFor("Uno de los registros relacionados ya no está disponible.", 404);
  }
  if (!auditId && risk?.linkedAuditId) {
    auditId = risk.linkedAuditId;
    audit = await planningRepository.findById(auditId);
    if (!audit) throw errorFor("La auditoría relacionada ya no está disponible.", 404);
  }
  if (!audit && !risk && !control) {
    throw errorFor("Relaciona el hallazgo con una auditoría, un riesgo o un control.", 400);
  }
  if (control && risk && !control.riskIds.includes(risk.id)) {
    throw errorFor("El control no está vinculado al riesgo seleccionado.", 409);
  }
  if (risk && audit && risk.linkedAuditId !== audit.id) {
    throw errorFor("La auditoría y el riesgo seleccionados no están relacionados.", 409);
  }
  if (control && audit && !risk) {
    const linkedRisks = await Promise.all(control.riskIds.map((id) => riskRepository.findById(id)));
    if (!linkedRisks.some((item) => item?.linkedAuditId === audit.id)) {
      throw errorFor("La auditoría no está relacionada con el control seleccionado.", 409);
    }
  }
  const parents = [audit, risk, control].filter(Boolean);
  const orgUnitIds = new Set(parents.map((item) => item.orgUnitId || null));
  if (orgUnitIds.size > 1) throw errorFor("Los registros relacionados deben pertenecer al mismo ámbito.", 409);
  return { audit, risk, control, auditId, riskId, controlId,
    orgUnitId: parents[0]?.orgUnitId || null };
};

const createDetailedFindingForUser = async (user, input, operationId) => {
  if (!RECORD_CREATE_ROLES.includes(user.role)) {
    throw errorFor("Tu rol no puede registrar hallazgos.", 403);
  }
  const title = text(input.title);
  const description = text(input.description);
  const rootCause = text(input.rootCause);
  const severity = text(input.severity);
  if (title.length < 3 || title.length > 120) throw errorFor("El título debe tener entre 3 y 120 caracteres.", 400);
  if (description.length < 10 || description.length > 2000) {
    throw errorFor("La descripción debe tener entre 10 y 2,000 caracteres.", 400);
  }
  if (rootCause.length < 10 || rootCause.length > 2000) {
    throw errorFor("La causa raíz debe tener entre 10 y 2,000 caracteres.", 400);
  }
  if (!SEVERITIES.includes(severity)) throw errorFor("Selecciona una severidad válida.", 400);
  const relations = await resolveRelations(input);
  const { audit, risk, control } = relations;
  const controlRisks = control
    ? await Promise.all(control.riskIds.map((id) => riskRepository.findById(id))) : [];
  const auditorOwnsRelation = risk?.ownerId === user.id || audit?.responsibleId === user.id ||
    controlRisks.some((item) => item?.ownerId === user.id);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) &&
      !(user.role === ROLES.AUDITOR && auditorOwnsRelation)) {
    throw errorFor("No puedes registrar hallazgos para estos registros.", 403);
  }
  if (audit) await assertWritableSourceScope(user, "AUDIT", audit);
  if (risk) await assertWritableSourceScope(user, "RISK", risk);
  if (control) await assertWritableSourceScope(user, "CONTROL", control);
  const assigneeId = Number(user.role === ROLES.AUDITOR ? user.id : input.assigneeId);
  const assignee = (await userRepository.getAll()).find((item) =>
    item.id === assigneeId && item.status === USER_STATUS.ACTIVE);
  if (!assignee) throw errorFor("Selecciona una persona responsable con cuenta activa.", 400);
  for (const [type, source] of [["AUDIT", audit], ["RISK", risk], ["CONTROL", control]]) {
    if (source && !await visibleRecordForUser(assignee, type, source.id)) {
      throw errorFor("La persona responsable debe tener acceso a todos los registros relacionados.", 400);
    }
  }
  const finding = await findingRepository.create({
    title, description, rootCause, severity,
    assigneeId: assignee.id, assigneeName: assignee.name,
    orgUnitId: relations.orgUnitId,
    auditId: audit?.id || null, auditTitle: audit?.title || null,
    riskId: risk?.id || null, riskTitle: risk?.title || null,
    controlId: control?.id || null, controlTitle: control?.title || null,
    proposalId: audit?.id || null, evaluationVersion: null,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, username: user.username, role: user.role }
  });
  await logActivity({ actor: user, action: "FINDING_REGISTERED", details: {
    findingId: finding.id, auditId: finding.auditId, riskId: finding.riskId,
    controlId: finding.controlId, severity: finding.severity, assigneeId: finding.assigneeId
  } });
  return finding;
};

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
  if (!canCreateFindingForRisk(user, risk)) {
    throw errorFor("No puedes registrar hallazgos para este riesgo.", 403);
  }
  await assertWritableSourceScope(user, "RISK", risk);
  await assertWritableSourceScope(user, "CONTROL", control);
  if ((risk.orgUnitId || null) !== (control.orgUnitId || null)) {
    throw errorFor("El control y el riesgo deben pertenecer al mismo ámbito.", 409);
  }
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
  const hasDetailedFields = ["rootCause", "severity", "assigneeId"].some((key) =>
    input[key] !== undefined);
  if (hasDetailedFields) return createDetailedFindingForUser(user, input, operationId);
  if (operationId) {
    const existing = (await findingRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      if (existing.createdBy?.id !== user.id) {
        throw errorFor("El hallazgo no está disponible para tu cuenta.", 404);
      }
      const risk = await riskRepository.findById(existing.riskId);
      if (!risk) throw errorFor("Riesgo no encontrado.", 404);
      if (!canCreateFindingForRisk(user, risk)) {
        throw errorFor("No puedes registrar hallazgos para este riesgo.", 403);
      }
      await assertWritableSourceScope(user, "FINDING", existing);
      return existing;
    }
  }
  const { title, description, control, risk } = await prepareFinding(user, input, expectedControlVersion);
  const finding = await findingRepository.create({ title, description,
    orgUnitId: risk.orgUnitId || null,
    controlId: control.id, controlTitle: control.title,
    riskId: risk.id, riskTitle: risk.title, auditId: risk.linkedAuditId || null,
    proposalId: risk.linkedAuditId || null, evaluationVersion: control.evaluations.length,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, username: user.username, role: user.role } });
  await logActivity({ actor: user, action: "FINDING_REGISTERED", details: {
    findingId: finding.id, controlId: control.id, riskId: risk.id, auditId: finding.auditId } });
  return finding;
};

module.exports = { SEVERITIES, prepareFinding, createFindingForUser };
