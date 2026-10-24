const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { ROLES } = require("../config/roles");
const { filterByVisibleScope, canViewRecordScope, projectVisibleRiskRelations } = require("./recordScopeVisibility");

const empty = () => ({ AUDIT: [], RISK: [], CONTROL: [], FINDING: [] });

// One read projection for routes that link to another record (actions, evidence).
// Module-specific write permissions must still be checked by their services.
const visibleCollectionsForUser = async (user) => {
  if (!Object.values(ROLES).includes(user.role)) return empty();
  const [allAudits, allRisks, allControls, allFindings] = await Promise.all([
    planningRepository.getAll(), riskRepository.getAll(), controlRepository.getAll(), findingRepository.getAll()
  ]);
  const scopedAudits = await filterByVisibleScope(user, allAudits);
  const related = await projectVisibleRiskRelations(user, allRisks, allControls, allFindings);
  return {
    AUDIT: user.role === ROLES.AUDITOR
      ? scopedAudits.filter((item) => item.responsibleId === user.id) : scopedAudits,
    RISK: related.risks,
    CONTROL: related.controls,
    FINDING: related.findings
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
  if (type === "CONTROL" || type === "FINDING") {
    const finding = type === "FINDING" ? await findingRepository.findById(id) : null;
    const control = await controlRepository.findById(type === "CONTROL" ? id : finding?.controlId);
    if (type === "CONTROL" && !control) return null;
    if (type === "FINDING" && !finding) return null;
    const riskIds = new Set(control?.riskIds || []);
    if (finding?.riskId) riskIds.add(finding.riskId);
    const risks = (await Promise.all([...riskIds].map((riskId) => riskRepository.findById(riskId))))
      .filter(Boolean);
    const visible = await projectVisibleRiskRelations(user, risks, control ? [control] : [], finding ? [finding] : []);
    return type === "CONTROL" ? visible.controls[0] || null : visible.findings[0] || null;
  }
  return null;
};

module.exports = { visibleCollectionsForUser, visibleRecordForUser };
