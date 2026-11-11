const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { ROLES } = require("../config/roles");
const { filterByVisibleScope, canViewRecordScope, projectVisibleRiskRelations,
  projectVisibleAuditLinks } = require("./recordScopeVisibility");

const empty = () => ({ AUDIT: [], RISK: [], CONTROL: [], FINDING: [] });

// One read projection for routes that link to another record (actions, evidence).
// Module-specific write permissions must still be checked by their services.
const visibleCollectionsForUser = async (user) => {
  if (!Object.values(ROLES).includes(user.role)) return empty();
  const [allAudits, allRisks, allControls, allFindings] = await Promise.all([
    planningRepository.getAll(), riskRepository.getAll(), controlRepository.getAll(), findingRepository.getAll()
  ]);
  const scopedAudits = await filterByVisibleScope(user, allAudits);
  const related = await projectVisibleRiskRelations(user, allRisks, allControls, allFindings, allAudits);
  const audits = user.role === ROLES.AUDITOR
    ? scopedAudits.filter((item) => item.responsibleId === user.id) : scopedAudits;
  const findings = [];
  for (const finding of allFindings) {
    if (await visibleRecordForUser(user, "FINDING", finding.id)) findings.push(finding);
  }
  return {
    AUDIT: audits,
    RISK: projectVisibleAuditLinks(related.risks, audits),
    CONTROL: related.controls,
    FINDING: findings
  };
};

const visibleRecordForUser = async (user, type, id) => {
  if (!Object.values(ROLES).includes(user.role)) return null;
  if (type === "AUDIT" || type === "RISK") {
    const record = type === "AUDIT" ? await planningRepository.findById(id) : await riskRepository.findById(id);
    if (!record || !await canViewRecordScope(user, record)) return null;
    if (user.role === ROLES.AUDITOR &&
        (type === "AUDIT" ? record.responsibleId : record.ownerId) !== user.id) return null;
    return record;
  }
  if (type === "FINDING") {
    const finding = await findingRepository.findById(id);
    if (!finding || !await canViewRecordScope(user, finding)) return null;
    const linked = [
      ["AUDIT", finding.auditId],
      ["RISK", finding.riskId],
      ["CONTROL", finding.controlId]
    ].filter(([, sourceId]) => sourceId);
    if (!linked.length) return null;
    for (const [sourceType, sourceId] of linked) {
      if (!await visibleRecordForUser(user, sourceType, sourceId)) return null;
    }
    return finding;
  }
  if (type === "CONTROL") {
    const control = await controlRepository.findById(id);
    if (!control) return null;
    const riskIds = new Set(control.riskIds || []);
    const risks = (await Promise.all([...riskIds].map((riskId) => riskRepository.findById(riskId))))
      .filter(Boolean);
    const visible = await projectVisibleRiskRelations(user, risks, [control]);
    return visible.controls[0] || null;
  }
  return null;
};

module.exports = { visibleCollectionsForUser, visibleRecordForUser };
