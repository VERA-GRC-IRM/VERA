const { availableScopesFor, canManageScope } = require("./scopeAccessService");

// A legacy record without an organisational assignment keeps its current visibility.
// This is an additional restriction: callers must still apply their module role rules.
const filterByVisibleScope = async (user, records) => {
  if (!records.some((record) => record?.orgUnitId)) return records;
  const available = new Set((await availableScopesFor(user)).map((unit) => unit.id));
  return records.filter((record) => !record.orgUnitId || available.has(record.orgUnitId));
};

const canViewRecordScope = async (user, record) => {
  if (!record) return false;
  return (await filterByVisibleScope(user, [record])).length === 1;
};

// A visible risk may still refer to an audit outside the reader's scope.
// Keep the risk visible, but never expose or navigate to that audit ID.
const projectVisibleAuditLinks = (risks, visibleAudits) => {
  const auditIds = new Set(visibleAudits.map((audit) => audit.id));
  return risks.map((risk) => risk.linkedAuditId && !auditIds.has(risk.linkedAuditId)
    ? { ...risk, linkedAuditId: null } : risk);
};

const assertWritableRecordScope = async (user, record) => {
  if (!record?.orgUnitId) return;
  if (!await canViewRecordScope(user, record)) {
    throw Object.assign(new Error("El registro no existe o no está disponible para tu cuenta."), { status: 404 });
  }
  if (!await canManageScope(user, record.orgUnitId)) {
    throw Object.assign(new Error("Tu autorización para este ámbito permite consultar, no modificar."), { status: 403 });
  }
};

// Keep the existing role view for legacy records. Once any relation has an
// explicit scope, a shared control must not expose a risk in a denied scope.
const projectVisibleRiskRelations = async (user, allRisks, allControls, allFindings = []) => {
  const auditor = user.role === "AUDITOR";
  const scopedRisks = await filterByVisibleScope(user, allRisks);
  const risks = auditor ? scopedRisks.filter((item) => item.ownerId === user.id) : scopedRisks;
  const riskIds = new Set(risks.map((item) => item.id));
  const scopedRelations = [...allRisks, ...allControls, ...allFindings].some((item) => item.orgUnitId);
  const scopedControls = await filterByVisibleScope(user, allControls);
  const controls = scopedControls.filter((item) =>
    (!auditor || item.riskIds?.some((id) => riskIds.has(id))) &&
    (!scopedRelations || (item.riskIds || []).every((id) => riskIds.has(id))));
  const controlIds = new Set(controls.map((item) => item.id));
  const scopedFindings = await filterByVisibleScope(user, allFindings);
  const findings = scopedFindings.filter((item) =>
    (!auditor || riskIds.has(item.riskId)) &&
    (!scopedRelations || (riskIds.has(item.riskId) && controlIds.has(item.controlId))));
  return { risks, controls, findings };
};

module.exports = { filterByVisibleScope, canViewRecordScope, assertWritableRecordScope,
  projectVisibleRiskRelations, projectVisibleAuditLinks };
