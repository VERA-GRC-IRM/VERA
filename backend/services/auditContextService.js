const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const { ROLES } = require("../config/roles");
const { canViewRecordScope, projectVisibleRiskRelations } = require("./recordScopeVisibility");

// Una sola definición de las relaciones del expediente, también usada por el dossier de IA.
const relateAudit = (auditId, { risks = [], controls = [], findings = [], evidence = [] }) => {
  const linkedRisks = risks.filter((item) => item.linkedAuditId === auditId);
  const riskIds = new Set(linkedRisks.map((item) => item.id));
  const linkedControls = controls.filter((item) => item.riskIds?.some((id) => riskIds.has(id)));
  const controlIds = new Set(linkedControls.map((item) => item.id));
  const linkedFindings = findings.filter((item) => riskIds.has(item.riskId) && controlIds.has(item.controlId));
  const linkedEvidence = evidence.filter((item) =>
    (item.entityType === "AUDIT" && item.entityId === auditId) ||
    (item.entityType === "RISK" && riskIds.has(item.entityId)) ||
    (item.entityType === "CONTROL" && controlIds.has(item.entityId))
  );
  return { risks: linkedRisks, controls: linkedControls, findings: linkedFindings, evidence: linkedEvidence };
};

const buildAuditContext = async (user, auditId) => {
  if (typeof auditId !== "string" || !auditId.trim() || auditId.length > 80) {
    const error = new Error("Selecciona una auditoría válida.");
    error.status = 400;
    throw error;
  }
  if (!Object.values(ROLES).includes(user.role)) {
    const error = new Error("Este rol no tiene acceso al expediente.");
    error.status = 403;
    throw error;
  }

  const audit = await planningRepository.findById(auditId);
  if (!audit || !await canViewRecordScope(user, audit) ||
      (user.role === ROLES.AUDITOR && audit.responsibleId !== user.id)) {
    const error = new Error("La auditoría no existe o no está disponible para tu cuenta.");
    error.status = 404;
    throw error;
  }

  const [allRisks, allControls, allFindings, allEvidence] = await Promise.all([
    riskRepository.getAll(), controlRepository.getAll(), findingRepository.getAll(), evidenceRepository.getAll()
  ]);
  const auditor = user.role === ROLES.AUDITOR;
  const { risks, controls, findings } = await projectVisibleRiskRelations(
    user, allRisks, allControls, allFindings);
  const visibleRiskIds = new Set(risks.map((item) => item.id));
  const visibleControlIds = new Set(controls.map((item) => item.id));
  const evidence = auditor ? allEvidence.filter((item) =>
    (item.entityType === "AUDIT" && item.entityId === auditId) ||
    (item.entityType === "RISK" && visibleRiskIds.has(item.entityId)) ||
    (item.entityType === "CONTROL" && visibleControlIds.has(item.entityId))
  ) : allEvidence;
  const related = relateAudit(auditId, { risks, controls, findings, evidence });
  const groups = {
    risks: related.risks.map(({ id, title, description, level, score }) => ({ id, title, description, level, score })),
    controls: related.controls.map(({ id, title, description, effectiveness, riskIds }) => ({
      id, title, description, effectiveness, riskIds: (riskIds || []).filter((riskId) =>
        related.risks.some((risk) => risk.id === riskId))
    })),
    findings: related.findings.map(({ id, title, description, status, riskId, controlId }) =>
      ({ id, title, description, status, riskId, controlId })),
    evidence: related.evidence.map(({ id, title, description, entityType, entityId, evidenceType, createdAt }) =>
      ({ id, title, description, entityType, entityId, evidenceType, createdAt }))
  };
  return {
    audit: {
      id: audit.id, title: audit.title, status: audit.status,
      objective: audit.objective, scope: audit.scope, area: audit.area,
      type: audit.type, responsible: audit.responsible,
      quarter: audit.quarter, year: audit.year,
      startDate: audit.startDate, endDate: audit.endDate,
      progress: audit.progress, risk: audit.risk, riskScore: audit.riskScore,
      updatedAt: audit.updatedAt
    },
    groups,
    counts: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.length])),
    asOf: new Date().toISOString(),
    scope: auditor ? "Relaciones visibles para tu cuenta" : "Relaciones del expediente",
    mode: "read-only"
  };
};

module.exports = { relateAudit, buildAuditContext };
