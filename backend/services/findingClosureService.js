const findingRepository = require("../repositories/findingRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const planningRepository = require("../repositories/planningRepository");
const actionRepository = require("../repositories/actionRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope } = require("./recordWriteScopeService");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const text = (value) => String(value ?? "").trim();
const currentActiveUser = async (user) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== "ACTIVE" || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
};
const versionFor = (value) => {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw errorFor("Actualiza el hallazgo antes de cambiarlo.", 400);
  }
  return version;
};
const findingForUser = async (user, id) => {
  const finding = await findingRepository.findById(id);
  if (!finding) throw errorFor("El hallazgo no existe o no está disponible para tu cuenta.", 404);
  await assertWritableSourceScope(user, "FINDING", finding);
  return finding;
};

const prepareFindingClosure = async (user, id, note, expectedVersion) => {
  await currentActiveUser(user);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) && user.role !== ROLES.AUDITOR) {
    throw errorFor("No puedes solicitar el cierre de este hallazgo.", 403);
  }
  const finding = await findingForUser(user, id);
  if (user.role === ROLES.AUDITOR && finding.assigneeId !== user.id &&
      finding.createdBy?.id !== user.id) {
    const risk = finding.riskId ? await riskRepository.findById(finding.riskId) : null;
    const control = finding.controlId ? await controlRepository.findById(finding.controlId) : null;
    const audit = finding.auditId ? await planningRepository.findById(finding.auditId) : null;
    const assigned = risk?.ownerId === user.id || audit?.responsibleId === user.id ||
      control?.riskIds?.some((riskId) => riskId === risk?.id && risk.ownerId === user.id);
    if (!assigned) throw errorFor("El hallazgo no existe o no está disponible para tu cuenta.", 404);
  }
  if (finding.status !== "OPEN") throw errorFor("Solo se puede solicitar el cierre de un hallazgo abierto.", 409);
  const reason = text(note);
  if (reason.length < 10 || reason.length > 1000) {
    throw errorFor("Explica la solicitud de cierre en 10 a 1,000 caracteres.", 400);
  }
  const version = versionFor(expectedVersion);
  if (finding.storageVersion !== version) {
    throw errorFor("El hallazgo cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  const actions = (await actionRepository.getAll()).filter((item) =>
    item.sourceType === "FINDING" && item.sourceId === finding.id);
  if (!actions.length || actions.some((item) => item.status !== "DONE")) {
    throw errorFor("Termina todas las acciones vinculadas antes de solicitar el cierre.", 409);
  }
  return { finding, actions, note: reason, version };
};

const closeFindingForUser = async (user, id, note, expectedVersion) => {
  const prepared = await prepareFindingClosure(user, id, note, expectedVersion);
  const requestedAt = new Date().toISOString();
  const requestedBy = { id: user.id, username: user.username, role: user.role };
  const updated = await findingRepository.mutate(id, {
    status: "PENDING_VALIDATION",
    closureRequest: { note: prepared.note, requestedAt, requestedBy },
    closureDecision: null
  }, prepared.version);
  await logActivity({ actor: user, action: "FINDING_CLOSURE_REQUESTED", details: {
    findingId: id, riskId: prepared.finding.riskId, controlId: prepared.finding.controlId,
    completedActionIds: prepared.actions.map((item) => item.id)
  } });
  return updated;
};

const decideFindingClosureForUser = async (user, id, body = {}) => {
  await currentActiveUser(user);
  if (user.role !== ROLES.SUPER_ADMIN) {
    throw errorFor("Solo Super Admin puede validar el cierre de un hallazgo.", 403);
  }
  const finding = await findingForUser(user, id);
  if (finding.status !== "PENDING_VALIDATION" || !finding.closureRequest) {
    throw errorFor("El hallazgo no tiene un cierre pendiente de validación.", 409);
  }
  if (finding.closureRequest.requestedBy?.id === user.id || finding.assigneeId === user.id) {
    throw errorFor("La persona revisora debe ser distinta del solicitante y responsable.", 403);
  }
  const version = versionFor(body.version);
  if (finding.storageVersion !== version) {
    throw errorFor("El hallazgo cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  const decision = text(body.decision);
  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw errorFor("Selecciona aprobar o rechazar el cierre.", 400);
  }
  const note = text(body.note);
  if (decision === "REJECT" && (note.length < 10 || note.length > 1000)) {
    throw errorFor("Explica el motivo del rechazo en 10 a 1,000 caracteres.", 400);
  }
  if (decision === "APPROVE" && note.length > 1000) {
    throw errorFor("La observación admite hasta 1,000 caracteres.", 400);
  }
  const decidedAt = new Date().toISOString();
  const decidedBy = { id: user.id, username: user.username, role: user.role };
  const closureDecision = { decision, note, decidedAt, decidedBy };
  const history = [...(finding.closureHistory || []), closureDecision];
  const changes = decision === "APPROVE"
    ? { status: "CLOSED", closureDecision, closureHistory: history,
      closureNote: finding.closureRequest.note, closedAt: decidedAt, closedBy: decidedBy }
    : { status: "OPEN", closureRequest: null, closureDecision, closureHistory: history,
      closureRejectionReason: note, closureRejectedAt: decidedAt, closureRejectedBy: decidedBy };
  const updated = await findingRepository.mutate(id, changes, version);
  await logActivity({ actor: user,
    action: decision === "APPROVE" ? "FINDING_CLOSED" : "FINDING_CLOSURE_REJECTED",
    details: { findingId: id, riskId: finding.riskId, controlId: finding.controlId,
      requestedBy: finding.closureRequest.requestedBy?.id || null, decision } });
  return updated;
};

module.exports = { prepareFindingClosure, closeFindingForUser, decideFindingClosureForUser };
