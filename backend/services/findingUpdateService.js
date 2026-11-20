const findingRepository = require("../repositories/findingRepository");
const userRepository = require("../repositories/userRepository");
const { USER_STATUS } = require("../config/accountRules");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { assertWritableSourceScope } = require("./recordWriteScopeService");
const { prepareFinding } = require("./findingCreationService");
const { logActivity } = require("./auditLogger");

const errorFor = (message, status) => Object.assign(new Error(message), { status });
const actorFor = (user) => ({ id: user.id, username: user.username, role: user.role });

const updateFindingForUser = async (user, id, input = {}) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    throw errorFor("Tu rol no puede editar hallazgos.", 403);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw errorFor("Los datos del hallazgo no son válidos.", 400);
  }

  const finding = await findingRepository.findById(id);
  if (!finding || !await visibleRecordForUser(user, "FINDING", id)) {
    throw errorFor("El hallazgo no existe o no está disponible para tu cuenta.", 404);
  }
  await assertWritableSourceScope(user, "FINDING", finding);
  if (finding.status !== "OPEN") {
    throw errorFor("Solo se pueden editar hallazgos abiertos.", 409);
  }

  const version = Number(input.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw errorFor("Actualiza el hallazgo antes de editarlo.", 400);
  }
  if (finding.storageVersion !== version) {
    throw errorFor("El hallazgo cambió desde que lo abriste. Actualiza y vuelve a intentar.", 409);
  }

  const prepared = await prepareFinding(user, {
    title: input.title,
    description: input.description,
    rootCause: input.rootCause,
    severity: input.severity,
    responsibleId: input.responsibleId,
    auditId: finding.auditId,
    riskId: finding.riskId,
    controlId: finding.controlId,
    evidenceIds: finding.evidenceIds || []
  }, undefined, { allowEffectiveControl: true, validateEvidence: false });

  const updated = await findingRepository.mutate(id, {
    title: prepared.title,
    description: prepared.description,
    rootCause: prepared.rootCause,
    severity: prepared.severity,
    responsibleId: prepared.responsible.id,
    responsibleName: prepared.responsible.name,
    updatedBy: actorFor(user)
  }, version);
  if (!updated) throw errorFor("El hallazgo dejó de estar disponible.", 409);

  await logActivity({ actor: user, action: "FINDING_UPDATED",
    details: { findingId: updated.id, severity: updated.severity } });
  return updated;
};

module.exports = { updateFindingForUser };
