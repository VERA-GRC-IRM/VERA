const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const controlRepository = require("../repositories/controlRepository");
const { ROLES } = require("../config/roles");
const { assertWritableRecordScope, UNAVAILABLE_RECORD } = require("./recordScopeVisibility");

const assertWritableRiskAuditLink = async (user, risk) => {
  if (!risk.linkedAuditId) return;
  const audit = await planningRepository.findById(risk.linkedAuditId);
  if (!audit) return;
  await assertWritableRecordScope(user, audit);
  if ((risk.orgUnitId || audit.orgUnitId) && risk.orgUnitId !== audit.orgUnitId) {
    throw Object.assign(new Error("El riesgo y la auditoría deben pertenecer al mismo ámbito."), { status: 409 });
  }
};

const assertWritableControlScope = async (user, control) => {
  await assertWritableRecordScope(user, control);
  const risks = await Promise.all((control.riskIds || []).map((id) => riskRepository.findById(id)));
  for (const risk of risks.filter(Boolean)) {
    if (user.role === ROLES.AUDITOR && risk.ownerId !== user.id) {
      throw Object.assign(new Error(UNAVAILABLE_RECORD), { status: 404 });
    }
    await assertWritableRecordScope(user, risk);
    if ((risk.orgUnitId || null) !== (control.orgUnitId || null)) {
      throw Object.assign(new Error("La relación control-riesgo requiere el mismo ámbito."), { status: 409 });
    }
  }
};

const assertWritableSourceScope = async (user, type, source) => {
  if (type === "AUDIT") return assertWritableRecordScope(user, source);
  if (type === "RISK") {
    await assertWritableRecordScope(user, source);
    return assertWritableRiskAuditLink(user, source);
  }
  if (type === "CONTROL") return assertWritableControlScope(user, source);
  if (type === "FINDING") {
    await assertWritableRecordScope(user, source);
    const risk = source.riskId ? await riskRepository.findById(source.riskId) : null;
    const control = source.controlId ? await controlRepository.findById(source.controlId) : null;
    const audit = source.auditId ? await planningRepository.findById(source.auditId) : null;
    const controlRisks = control
      ? await Promise.all(control.riskIds.map((riskId) => riskRepository.findById(riskId))) : [];
    if (risk) await assertWritableRecordScope(user, risk);
    if (control) await assertWritableControlScope(user, control);
    if (audit) await assertWritableRecordScope(user, audit);
    if ((source.orgUnitId || risk?.orgUnitId || control?.orgUnitId || audit?.orgUnitId) &&
        [risk, control, audit].filter(Boolean).some((item) =>
          (item.orgUnitId || null) !== (source.orgUnitId || null))) {
      throw Object.assign(new Error("El hallazgo y sus relaciones deben pertenecer al mismo ámbito."), { status: 409 });
    }
    if (user.role === ROLES.AUDITOR && risk?.ownerId !== user.id &&
        audit?.responsibleId !== user.id && !controlRisks.some((item) => item?.ownerId === user.id)) {
      throw Object.assign(new Error(UNAVAILABLE_RECORD), { status: 404 });
    }
  }
};

module.exports = { assertWritableRecordScope, assertWritableRiskAuditLink,
  assertWritableControlScope, assertWritableSourceScope };
