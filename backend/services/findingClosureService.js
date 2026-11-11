const findingRepository = require("../repositories/findingRepository");
const actionRepository = require("../repositories/actionRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/accountRules");
const { logActivity } = require("./auditLogger");
const { assertWritableSourceScope } = require("./recordWriteScopeService");
const { visibleRecordForUser } = require("./recordReadAccessService");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const text = (value) => String(value ?? "").trim();
const actorFor = (user) => ({ id: user.id, username: user.username, role: user.role });

const assertCurrentUser = async (user) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
};

const findingForWrite = async (user, id) => {
  const finding = await findingRepository.findById(id);
  if (!finding || !await visibleRecordForUser(user, "FINDING", id)) {
    throw errorFor("El hallazgo no existe o no está disponible para tu cuenta.", 404);
  }
  await assertWritableSourceScope(user, "FINDING", finding);
  return finding;
};

const assertVersion = (finding, expectedVersion) => {
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw errorFor("Actualiza el hallazgo antes de continuar.", 400);
  }
  if (finding.storageVersion !== version) {
    throw errorFor("El hallazgo cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  return version;
};

const prepareFindingClosure = async (user, id, note, expectedVersion) => {
  await assertCurrentUser(user);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) && user.role !== ROLES.AUDITOR) {
    throw errorFor("Tu rol no puede solicitar el cierre de hallazgos.", 403);
  }
  const finding = await findingForWrite(user, id);
  if (finding.status !== "OPEN") throw errorFor("El hallazgo no está abierto para solicitar su cierre.", 409);
  const reason = text(note);
  if (reason.length < 10 || reason.length > 1000) {
    throw errorFor("Explica la solicitud de cierre en 10 a 1,000 caracteres.", 400);
  }
  const version = assertVersion(finding, expectedVersion);
  const actions = (await actionRepository.getAll()).filter((item) =>
    item.sourceType === "FINDING" && item.sourceId === finding.id);
  if (actions.length === 0) {
    throw errorFor("Agrega al menos una acción y complétala antes de solicitar el cierre.", 409);
  }
  if (actions.some((item) => !["DONE", "CANCELLED"].includes(item.status))) {
    throw errorFor("Termina o cancela todas las acciones vinculadas antes de solicitar el cierre.", 409);
  }
  return { finding, actions, note: reason, version };
};

const requestFindingClosureForUser = async (user, id, note, expectedVersion) => {
  const prepared = await prepareFindingClosure(user, id, note, expectedVersion);
  const requestedAt = new Date().toISOString();
  const request = {
    version: (prepared.finding.closureHistory || []).length + 1,
    status: "PENDING",
    note: prepared.note,
    requestedAt,
    requestedBy: actorFor(user)
  };
  const updated = await findingRepository.mutate(id, {
    status: "PENDING_CLOSURE",
    closureNote: prepared.note,
    closureHistory: [...(prepared.finding.closureHistory || []), request]
  }, prepared.version);
  await logActivity({ actor: user, action: "FINDING_CLOSURE_REQUESTED", details: {
    findingId: id, riskId: prepared.finding.riskId, controlId: prepared.finding.controlId,
    auditId: prepared.finding.auditId
  } });
  return updated;
};

const prepareFindingClosureDecision = async (user, id, body = {}) => {
  await assertCurrentUser(user);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw errorFor("Los datos de la decisión no son válidos.", 400);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) {
    throw errorFor("Solo Super Admin o Gerencia puede revisar el cierre de un hallazgo.", 403);
  }
  const finding = await findingForWrite(user, id);
  if (finding.status !== "PENDING_CLOSURE") {
    throw errorFor("El hallazgo no tiene una solicitud de cierre pendiente.", 409);
  }
  const version = assertVersion(finding, body.version);
  const history = finding.closureHistory || [];
  const requestIndex = history.length - 1;
  const request = history[requestIndex];
  if (!request || request.status !== "PENDING") {
    throw errorFor("La solicitud de cierre no está disponible para revisión.", 409);
  }
  if (String(request.requestedBy?.id) === String(user.id)) {
    throw errorFor("Quien solicita el cierre no puede aprobarlo ni rechazarlo.", 403);
  }
  const decision = text(body.decision).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw errorFor("Selecciona aprobar o rechazar el cierre.", 400);
  }
  const reason = text(body.reason);
  if (decision === "REJECT" && !reason) {
    throw errorFor("Escribe el motivo del rechazo.", 400);
  }
  if (reason.length > 1000) throw errorFor("El motivo no puede superar 1,000 caracteres.", 400);
  const actions = (await actionRepository.getAll()).filter((item) =>
    item.sourceType === "FINDING" && item.sourceId === finding.id);
  if (decision === "APPROVE" && actions.some((item) => !["DONE", "CANCELLED"].includes(item.status))) {
    throw errorFor("El plan cambió y contiene acciones sin terminar; no se puede aprobar el cierre.", 409);
  }
  return { finding, history, requestIndex, request, decision, reason, version };
};

const reviewFindingClosureForUser = async (user, id, body) => {
  const prepared = await prepareFindingClosureDecision(user, id, body);
  const decidedAt = new Date().toISOString();
  const decision = {
    ...prepared.request,
    status: prepared.decision === "APPROVE" ? "APPROVED" : "REJECTED",
    decision: prepared.decision,
    decidedAt,
    decidedBy: actorFor(user),
    ...(prepared.reason ? { decisionReason: prepared.reason } : {})
  };
  const closureHistory = [...prepared.history];
  closureHistory[prepared.requestIndex] = decision;
  const changes = prepared.decision === "APPROVE"
    ? { status: "CLOSED", closedAt: decidedAt, closedBy: actorFor(user), closureHistory }
    : { status: "OPEN", closedAt: null, closedBy: null, closureHistory };
  const updated = await findingRepository.mutate(id, changes, prepared.version);
  const action = prepared.decision === "APPROVE" ? "FINDING_CLOSURE_APPROVED" : "FINDING_CLOSURE_REJECTED";
  await logActivity({ actor: user, action, details: {
    findingId: id, riskId: prepared.finding.riskId, controlId: prepared.finding.controlId,
    auditId: prepared.finding.auditId
  } });
  return updated;
};

module.exports = {
  prepareFindingClosure,
  requestFindingClosureForUser,
  prepareFindingClosureDecision,
  reviewFindingClosureForUser,
  closeFindingForUser: requestFindingClosureForUser
};
