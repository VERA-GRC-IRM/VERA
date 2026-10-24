const findingRepository = require("../repositories/findingRepository");
const riskRepository = require("../repositories/riskRepository");
const actionRepository = require("../repositories/actionRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope } = require("./recordWriteScopeService");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };

const prepareFindingClosure = async (user, id, note, expectedVersion) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  const finding = await findingRepository.findById(id);
  const risk = finding ? await riskRepository.findById(finding.riskId) : null;
  if (!finding || (user.role === ROLES.AUDITOR && risk?.ownerId !== user.id)) {
    throw errorFor("El hallazgo no existe o no está disponible para tu cuenta.", 404);
  }
  await assertWritableSourceScope(user, "FINDING", finding);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) &&
      !(user.role === ROLES.AUDITOR && risk?.ownerId === user.id)) {
    throw errorFor("No puedes cerrar este hallazgo.", 403);
  }
  if (finding.status !== "OPEN") throw errorFor("El hallazgo ya está cerrado.", 409);
  const reason = String(note ?? "").trim();
  if (reason.length < 10 || reason.length > 1000) throw errorFor("Explica el cierre en 10 a 1,000 caracteres.", 400);
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw errorFor("Actualiza el hallazgo antes de cerrarlo.", 400);
  }
  if (finding.storageVersion !== version) {
    throw errorFor("El hallazgo cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  const actions = (await actionRepository.getAll()).filter((item) =>
    item.sourceType === "FINDING" && item.sourceId === finding.id);
  if (!actions.length || actions.some((item) => item.status !== "DONE")) {
    throw errorFor("Termina todas las acciones vinculadas antes de cerrar el hallazgo.", 409);
  }
  return { finding, risk, actions, note: reason, version };
};

const closeFindingForUser = async (user, id, note, expectedVersion) => {
  const prepared = await prepareFindingClosure(user, id, note, expectedVersion);
  const closedAt = new Date().toISOString();
  const closed = await findingRepository.mutate(id, {
    status: "CLOSED", closureNote: prepared.note, closedAt,
    closedBy: { id: user.id, username: user.username, role: user.role }
  }, prepared.version);
  await logActivity({ actor: user, action: "FINDING_CLOSED", details: {
    findingId: id, riskId: prepared.finding.riskId, controlId: prepared.finding.controlId,
    completedActionIds: prepared.actions.map((item) => item.id) } });
  return closed;
};

module.exports = { prepareFindingClosure, closeFindingForUser };
