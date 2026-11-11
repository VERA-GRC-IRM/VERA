const findingRepository = require("../repositories/findingRepository");
const controlRepository = require("../repositories/controlRepository");
const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/accountRules");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope } = require("./recordWriteScopeService");
const { scopeForNewRecord } = require("./recordCreationScopeService");
const { visibleRecordForUser } = require("./recordReadAccessService");
const notificationEvents = require("./notificationEventService");

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const text = (value) => String(value ?? "").trim();
const validId = (value) => !value || (typeof value === "string" && value.trim().length <= 80);
const canCreateFinding = (user) => RISK_CONTROL_MANAGE_ROLES.includes(user.role) ||
  user.role === ROLES.AUDITOR;

const prepareFinding = async (user, input = {}, expectedControlVersion) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw errorFor("Los datos del hallazgo no son válidos.", 400);
  }
  const title = text(input.title);
  const description = text(input.description);
  const rootCause = text(input.rootCause);
  const severity = text(input.severity).toUpperCase();
  const rawIds = {
    auditId: text(input.auditId),
    riskId: text(input.riskId),
    controlId: text(input.controlId)
  };
  if (Object.values(rawIds).some((id) => !validId(id))) {
    throw errorFor("Selecciona relaciones válidas para el hallazgo.", 400);
  }
  if (title.length < 3 || title.length > 120) throw errorFor("El título debe tener entre 3 y 120 caracteres.", 400);
  if (description.length < 10 || description.length > 2000) {
    throw errorFor("La descripción debe tener entre 10 y 2,000 caracteres.", 400);
  }
  if (rootCause.length < 10 || rootCause.length > 2000) {
    throw errorFor("La causa raíz debe tener entre 10 y 2,000 caracteres.", 400);
  }
  if (!SEVERITIES.includes(severity)) throw errorFor("Selecciona una severidad válida.", 400);
  if (!rawIds.auditId && !rawIds.riskId && !rawIds.controlId) {
    throw errorFor("Relaciona el hallazgo con una auditoría, un riesgo o un control.", 400);
  }

  const [audit, risk, control] = await Promise.all([
    rawIds.auditId ? planningRepository.findById(rawIds.auditId) : null,
    rawIds.riskId ? riskRepository.findById(rawIds.riskId) : null,
    rawIds.controlId ? controlRepository.findById(rawIds.controlId) : null
  ]);
  if ((rawIds.auditId && !audit) || (rawIds.riskId && !risk) || (rawIds.controlId && !control)) {
    throw errorFor("Una auditoría, riesgo o control relacionado no existe o no está disponible.", 404);
  }
  if (control && control.effectiveness >= 4) {
    throw errorFor("Un control evaluado como efectivo no permite registrar un hallazgo desde este flujo.", 409);
  }
  if (risk && control && !(control.riskIds || []).includes(risk.id)) {
    throw errorFor("El control no está relacionado con el riesgo seleccionado.", 409);
  }
  const auditLinkedToRisk = risk && (risk.linkedAuditId === rawIds.auditId ||
    (Array.isArray(risk.auditLinks) && risk.auditLinks.some((link) => link.auditId === rawIds.auditId)));
  if (risk && rawIds.auditId && !auditLinkedToRisk) {
    throw errorFor("La auditoría y el riesgo seleccionados no están relacionados.", 409);
  }

  const relations = [
    ["AUDIT", rawIds.auditId, audit],
    ["RISK", rawIds.riskId, risk],
    ["CONTROL", rawIds.controlId, control]
  ].filter(([, , record]) => record);
  for (const [type, id, record] of relations) {
    if (!await visibleRecordForUser(user, type, id)) {
      throw errorFor("El registro no existe o no está disponible para tu cuenta.", 404);
    }
    await assertWritableSourceScope(user, type, record);
  }

  const linkedAudit = audit;
  const allRelations = [...relations];
  const orgUnitId = await scopeForNewRecord(user, null, allRelations.map(([, , record]) => record));

  const responsibleId = Number(input.responsibleId ?? user.id);
  if (!Number.isSafeInteger(responsibleId) || responsibleId < 1) {
    throw errorFor("Selecciona una persona responsable activa.", 400);
  }
  const responsible = await userRepository.findById(responsibleId);
  if (!responsible || responsible.status !== USER_STATUS.ACTIVE) {
    throw errorFor("Selecciona una persona responsable activa.", 400);
  }
  for (const [type, id, record] of allRelations) {
    if (!await visibleRecordForUser(responsible, type, id)) {
      throw errorFor("La persona responsable no tiene acceso a todos los registros relacionados.", 400);
    }
    await assertWritableSourceScope(responsible, type, record);
  }

  if (expectedControlVersion !== undefined) {
    const version = Number(expectedControlVersion);
    if (!control || !Number.isSafeInteger(version) || version < 1) {
      throw errorFor("La versión de evaluación del control no es válida.", 400);
    }
    if (control.evaluations.length !== version) {
      throw errorFor("La evaluación del control cambió desde la vista previa. Revísala de nuevo.", 409);
    }
  }

  const rawEvidenceIds = input.evidenceIds === undefined ? [] : input.evidenceIds;
  if (!Array.isArray(rawEvidenceIds) || rawEvidenceIds.length > 20 ||
      rawEvidenceIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 80)) {
    throw errorFor("Selecciona hasta 20 evidencias válidas.", 400);
  }
  const evidenceIds = [...new Set(rawEvidenceIds.map((id) => id.trim()))];
  const linkedEntityIds = new Set(allRelations.map(([type, id]) => `${type}:${id}`));
  const evidence = await evidenceRepository.getAll();
  for (const evidenceId of evidenceIds) {
    const item = evidence.find((candidate) => candidate.id === evidenceId);
    if (!item || !linkedEntityIds.has(`${item.entityType}:${item.entityId}`)) {
      throw errorFor("La evidencia no existe o no está vinculada a un registro del hallazgo.", 404);
    }
  }

  return {
    title, description, rootCause, severity, audit: linkedAudit,
    risk, control, responsible, orgUnitId, evidenceIds,
    evaluationVersion: control ? control.evaluations.length : null
  };
};

const createFindingForUser = async (user, input, operationId = null, expectedControlVersion) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!canCreateFinding(user)) throw errorFor("Tu rol no puede registrar hallazgos.", 403);
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  const prepared = await prepareFinding(user, input, expectedControlVersion);
  if (operationId) {
    const existing = (await findingRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      if (existing.createdBy?.id !== user.id) throw errorFor("El hallazgo no está disponible para tu cuenta.", 404);
      const expected = {
        title: prepared.title, description: prepared.description, rootCause: prepared.rootCause,
        severity: prepared.severity, auditId: prepared.audit?.id || null,
        riskId: prepared.risk?.id || null, controlId: prepared.control?.id || null,
        responsibleId: prepared.responsible.id, evidenceIds: prepared.evidenceIds
      };
      if (Object.entries(expected).some(([key, value]) =>
        JSON.stringify(existing[key] ?? null) !== JSON.stringify(value))) {
        throw errorFor("Esta operación ya se usó con datos diferentes.", 409);
      }
      await assertWritableSourceScope(user, "FINDING", existing);
      return existing;
    }
  }
  const finding = await findingRepository.create({
    title: prepared.title, description: prepared.description, rootCause: prepared.rootCause,
    severity: prepared.severity, responsibleId: prepared.responsible.id,
    responsibleName: prepared.responsible.name,
    orgUnitId: prepared.orgUnitId,
    auditId: prepared.audit?.id || null, auditTitle: prepared.audit?.title || null,
    riskId: prepared.risk?.id || null, riskTitle: prepared.risk?.title || null,
    controlId: prepared.control?.id || null, controlTitle: prepared.control?.title || null,
    proposalId: prepared.audit?.id || null,
    evaluationVersion: prepared.evaluationVersion,
    evidenceIds: prepared.evidenceIds,
    closureHistory: [],
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, username: user.username, role: user.role }
  });
  await logActivity({ actor: user, action: "FINDING_REGISTERED", details: {
    findingId: finding.id, auditId: finding.auditId, controlId: finding.controlId, riskId: finding.riskId
  } });
  await notificationEvents.findingCreated(finding, prepared.risk, prepared.control, prepared.audit);
  return finding;
};

module.exports = { SEVERITIES, prepareFinding, createFindingForUser };
