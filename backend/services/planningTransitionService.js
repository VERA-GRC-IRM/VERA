const planningRepository = require("../repositories/planningRepository");
const { PLANNING_APPROVE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableRecordScope } = require("./recordScopeVisibility");

const text = (value) => String(value ?? "").trim();
const terminal = (status) => ["APPROVED", "ACTIVE", "CLOSED", "REJECTED"].includes(status);
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };

const applyTransition = async (user, id, operation, options = {}) => {
  if (!PLANNING_APPROVE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede decidir propuestas ni cambiar el estado de auditorías.", 403);
  if (typeof id !== "string" || !id.trim() || id.length > 80) throw errorFor("Selecciona una auditoría válida.", 400);
  const note = text(options.note);
  if (note.length > 1000) throw errorFor("El motivo no puede superar 1,000 caracteres.", 400);
  const current = await planningRepository.findById(id);
  if (!current) throw errorFor(["approve", "reject"].includes(operation) ? "Propuesta no encontrada." : "Auditoría no encontrada.", 404);
  await assertWritableRecordScope(user, current);
  if (options.version !== undefined && current.storageVersion !== options.version) {
    throw errorFor("La auditoría cambió desde la vista previa. Revísala de nuevo.", 409);
  }
  const actor = { id: user.id, name: user.username };
  let record;
  let action;
  let details;
  let kind;
  if (operation === "approve") {
    if (terminal(current.status)) throw errorFor("Esta propuesta ya fue resuelta.", 409);
    const quarter = text(options.quarter) || current.quarter;
    if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
      throw errorFor("Selecciona un trimestre para completar la aprobación.", 400);
    }
    record = await planningRepository.approve(id, { quarter, approvedBy: actor }, current.storageVersion);
    action = "AUDIT_PROPOSAL_APPROVED";
    details = { proposalId: id, title: record.title, quarter };
    kind = "proposal";
  } else if (operation === "reject") {
    if (terminal(current.status)) throw errorFor("Esta propuesta ya fue resuelta.", 409);
    const rejectionReason = text(options.reason);
    if (!rejectionReason) throw errorFor("Escribe el motivo del rechazo.", 400);
    record = await planningRepository.reject(id, { rejectionReason, rejectedBy: actor }, current.storageVersion);
    action = "AUDIT_PROPOSAL_REJECTED";
    details = { proposalId: id, title: record.title, reason: rejectionReason };
    kind = "proposal";
  } else if (operation === "start") {
    if (current.status !== "APPROVED") {
      throw errorFor("Solo se pueden iniciar auditorías aprobadas y pendientes de ejecución.", 409);
    }
    record = await planningRepository.start(id, { startedBy: actor }, current.storageVersion);
    action = "AUDIT_STARTED";
    details = { auditId: id, title: record.title };
    kind = "audit";
  } else if (operation === "close") {
    if (current.status !== "ACTIVE") throw errorFor("Solo se pueden cerrar auditorías en curso.", 409);
    record = await planningRepository.close(id, { closedBy: actor }, current.storageVersion);
    action = "AUDIT_CLOSED";
    details = { auditId: id, title: record.title };
    kind = "audit";
  } else {
    throw errorFor("La transición solicitada no es válida.", 400);
  }
  await logActivity({ actor: user, action,
    details: { ...details, ...(note && operation !== "reject" ? { note } : {}) } });
  return { kind, record };
};

module.exports = { applyTransition };
