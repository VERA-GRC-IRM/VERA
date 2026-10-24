const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const { assertWritableRecordScope } = require("./recordScopeVisibility");

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
    await assertWritableRecordScope(user, risk);
    if (risk.orgUnitId && control.orgUnitId !== risk.orgUnitId) {
      throw Object.assign(new Error("La relación control-riesgo requiere el mismo ámbito."), { status: 409 });
    }
  }
};

module.exports = { assertWritableRecordScope, assertWritableRiskAuditLink,
  assertWritableControlScope };
