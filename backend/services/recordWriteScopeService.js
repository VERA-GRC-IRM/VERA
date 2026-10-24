const riskRepository = require("../repositories/riskRepository");
const planningRepository = require("../repositories/planningRepository");
const controlRepository = require("../repositories/controlRepository");
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
    const risk = await riskRepository.findById(source.riskId);
    const control = await controlRepository.findById(source.controlId);
    if (risk) await assertWritableRecordScope(user, risk);
    if (control) await assertWritableControlScope(user, control);
    if ((source.orgUnitId || risk?.orgUnitId || control?.orgUnitId) &&
        (source.orgUnitId !== risk?.orgUnitId || source.orgUnitId !== control?.orgUnitId)) {
      throw Object.assign(new Error("El hallazgo y sus relaciones deben pertenecer al mismo ámbito."), { status: 409 });
    }
  }
};

module.exports = { assertWritableRecordScope, assertWritableRiskAuditLink,
  assertWritableControlScope, assertWritableSourceScope };
