const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/accountRules");
const { assertWritableRecordScope } = require("./recordScopeVisibility");
const { canViewRecordScope } = require("./recordScopeVisibility");
const { createRiskForUser } = require("./riskCreationService");
const { parseCore } = require("./riskCreationService");
const { evaluateRiskForUser } = require("./riskEvaluationService");
const { logActivity } = require("./auditLogger");

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value) => String(value ?? "").trim();

const relationFor = (risk, auditId) => {
  const links = Array.isArray(risk.auditLinks) ? risk.auditLinks : [];
  const existing = links.find((link) => link.auditId === auditId);
  if (existing) return existing;
  return risk.linkedAuditId === auditId
    ? {
        auditId,
        likelihood: risk.likelihood,
        impact: risk.impact,
        score: risk.score,
        level: risk.level,
        note: risk.note,
        status: risk.status || "OPEN"
      }
    : null;
};

const linksFor = (risk) => {
  const links = Array.isArray(risk.auditLinks) ? [...risk.auditLinks] : [];
  if (risk.linkedAuditId && !links.some((link) => link.auditId === risk.linkedAuditId)) {
    links.unshift({
      auditId: risk.linkedAuditId,
      likelihood: risk.likelihood,
      impact: risk.impact,
      score: risk.score,
      level: risk.level,
      note: risk.note,
      status: risk.status || "OPEN"
    });
  }
  return links;
};

const assertAuditAccess = async (user, auditId, write = false) => {
  const audit = await planningRepository.findById(auditId);
  if (!audit) throw fail("La auditoría no existe o no está disponible para tu cuenta.", 404);
  if (user.role === ROLES.AUDITOR && audit.responsibleId !== user.id) {
    throw fail("La auditoría no existe o no está disponible para tu cuenta.", 404);
  }
  if (write) await assertWritableRecordScope(user, audit);
  else if (!await canViewRecordScope(user, audit)) {
    throw fail("La auditoría no existe o no está disponible para tu cuenta.", 404);
  }
  return audit;
};

const assertCanManageAuditRisks = async (user, audit) => {
  const currentUser = await userRepository.findById(user.id);
  if (!currentUser || currentUser.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) && user.role !== ROLES.AUDITOR) {
    throw fail("Tu rol no puede administrar riesgos de auditoría.", 403);
  }
  if (user.role === ROLES.AUDITOR && audit.responsibleId !== user.id) {
    throw fail("Solo el auditor responsable puede administrar estos riesgos.", 403);
  }
};

const saveLinks = async (user, risk, auditId, links) => {
  const updated = await riskRepository.update(risk.id, {
    auditLinks: links,
    linkedAuditId: links[0]?.auditId || null
  }, risk.storageVersion);
  if (!updated) throw fail("El riesgo cambió mientras se guardaba. Actualiza e inténtalo de nuevo.", 409);
  return updated;
};

const listRisksForAudit = async (user, auditId) => {
  await assertAuditAccess(user, auditId);
  const risks = await riskRepository.getAll();
  return risks
    .map((risk) => {
      const relation = relationFor(risk, auditId);
      return relation ? { ...risk, ...relation, masterRiskId: risk.id, linkedAuditId: auditId } : null;
    })
    .filter(Boolean);
};

const createRiskForAudit = async (user, auditId, input) => {
  const audit = await assertAuditAccess(user, auditId, true);
  await assertCanManageAuditRisks(user, audit);
  const risk = await createRiskForUser(user, {
    ...input,
    linkedAuditId: auditId,
    ownerId: user.role === ROLES.AUDITOR ? user.id : input.ownerId
  }, null, { auditId });
  return saveLinks(user, risk, auditId, [{
    auditId,
    likelihood: risk.likelihood,
    impact: risk.impact,
    score: risk.score,
    level: risk.level,
    note: risk.note,
    status: risk.status || "OPEN"
  }]);
};

const linkRiskToAudit = async (user, auditId, riskId, assessment = {}) => {
  const audit = await assertAuditAccess(user, auditId, true);
  await assertCanManageAuditRisks(user, audit);
  const risk = await riskRepository.findById(riskId);
  if (!risk || !await canViewRecordScope(user, risk)) throw fail("El riesgo no existe o no está disponible para tu cuenta.", 404);
  if (relationFor(risk, auditId)) throw fail("El riesgo ya está vinculado a esta auditoría.", 409);
  const links = linksFor(risk);
  const relation = {
    auditId,
    likelihood: assessment.likelihood ?? risk.likelihood,
    impact: assessment.impact ?? risk.impact,
    score: assessment.score ?? risk.score,
    level: assessment.level ?? risk.level,
    note: assessment.note ?? risk.note,
    status: risk.status || "OPEN"
  };
  links.push(relation);
  return saveLinks(user, risk, auditId, links);
};

const unlinkRiskFromAudit = async (user, auditId, riskId) => {
  const audit = await assertAuditAccess(user, auditId, true);
  await assertCanManageAuditRisks(user, audit);
  const risk = await riskRepository.findById(riskId);
  if (!risk) throw fail("El riesgo no existe.", 404);
  const links = linksFor(risk);
  if (links.length) {
    const remaining = links.filter((link) => link.auditId !== auditId);
    if (remaining.length === links.length) throw fail("El riesgo no está vinculado a esta auditoría.", 404);
    return saveLinks(user, risk, auditId, remaining);
  }
  if (risk.linkedAuditId !== auditId) throw fail("El riesgo no está vinculado a esta auditoría.", 404);
  return riskRepository.update(risk.id, { linkedAuditId: null }, risk.storageVersion);
};

const updateRiskForAudit = async (user, auditId, riskId, input) => {
  const audit = await assertAuditAccess(user, auditId, true);
  await assertCanManageAuditRisks(user, audit);
  const current = await riskRepository.findById(riskId);
  if (!current || !relationFor(current, auditId)) throw fail("El riesgo no está vinculado a esta auditoría.", 404);
  const parsed = await parseCore({
    ...current,
    ...input,
    ownerId: current.ownerId,
    linkedAuditId: current.linkedAuditId || auditId
  });
  if (parsed.error) throw fail(parsed.error);
  const duplicate = await riskRepository.findDuplicate({ ...parsed.data, orgUnitId: current.orgUnitId }, current.id);
  if (duplicate) throw fail("Ya existe un riesgo con el mismo nombre y área.", 409);
  const updated = await riskRepository.update(current.id, {
    ...parsed.data,
    linkedAuditId: current.linkedAuditId || auditId
  }, current.storageVersion);
  if (!updated) throw fail("El riesgo cambió mientras se guardaba. Actualiza e inténtalo de nuevo.", 409);
  await logActivity({ actor: user, action: "RISK_UPDATED",
    details: { riskId: updated.id, title: updated.title, auditId } });
  return updated;
};

const evaluateRiskForAudit = async (user, auditId, riskId, body) => {
  const audit = await assertAuditAccess(user, auditId, true);
  await assertCanManageAuditRisks(user, audit);
  const risk = await riskRepository.findById(riskId);
  if (!risk || !relationFor(risk, auditId)) throw fail("El riesgo no está vinculado a esta auditoría.", 404);
  const evaluated = await evaluateRiskForUser(user, riskId, body, undefined, { auditId });
  const links = (Array.isArray(evaluated.auditLinks) ? evaluated.auditLinks : []).map((link) =>
    link.auditId === auditId ? {
      ...link,
      likelihood: evaluated.likelihood,
      impact: evaluated.impact,
      score: evaluated.score,
      level: evaluated.level,
      note: evaluated.note
    } : link);
  const current = await riskRepository.findById(riskId);
  return saveLinks(user, current, auditId, links);
};

module.exports = {
  listRisksForAudit,
  createRiskForAudit,
  linkRiskToAudit,
  unlinkRiskFromAudit,
  updateRiskForAudit,
  evaluateRiskForAudit
};
