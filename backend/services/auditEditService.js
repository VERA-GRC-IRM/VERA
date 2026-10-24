const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { PLANNING_APPROVE_ROLES } = require("../config/roles");
const { EDITABLE_FIELDS_BY_STATUS, FIELD_LABELS, STATUS_LABELS } = require("../config/auditEditRules");
const { parseProposal } = require("./proposalService");
const { logActivity } = require("./auditLogger");
const { assertWritableRecordScope } = require("./recordScopeVisibility");

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const activeEditor = async (user) => {
  const current = await userRepository.findById(user.id);
  if (!current || current.status !== "ACTIVE" || current.role !== user.role) {
    throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!PLANNING_APPROVE_ROLES.includes(user.role)) throw fail("Tu rol no puede editar auditorías.", 403);
};

const prepareAuditEdit = async (user, id, body, expected = {}) => {
  await activeEditor(user);
  const current = await planningRepository.findById(id);
  if (!current) throw fail("Auditoría no encontrada.", 404);
  await assertWritableRecordScope(user, current);
  const allowed = EDITABLE_FIELDS_BY_STATUS[current.status];
  if (!allowed) throw fail(`Una auditoría ${STATUS_LABELS[current.status] || current.status} no se puede editar desde aquí.`, 409);
  const sent = Object.keys(body || {});
  if (!sent.length) throw fail("Indica al menos un dato para modificar.");
  const blocked = sent.filter((field) => !allowed.includes(field));
  if (blocked.length) {
    throw fail(`No se puede modificar ${blocked.map((field) => FIELD_LABELS[field] || field).join(", ")} en una auditoría ${STATUS_LABELS[current.status]}.`);
  }
  if (expected.storageVersion !== undefined && current.storageVersion !== expected.storageVersion ||
      expected.updatedAt !== undefined && current.updatedAt !== expected.updatedAt ||
      expected.status !== undefined && current.status !== expected.status ||
      expected.field && current[expected.field] !== expected.value) {
    throw fail("La auditoría cambió desde la vista previa. Revísala otra vez.", 409);
  }
  const { data, error } = await parseProposal({ ...current, ...body });
  if (error) throw fail(error);
  if (current.status === "APPROVED" && !data.quarter) {
    throw fail("Una auditoría aprobada debe conservar un trimestre.");
  }
  const changes = {};
  for (const field of allowed) {
    const before = current[field] ?? null;
    const after = data[field] ?? null;
    if (String(before ?? "") !== String(after ?? "")) changes[field] = { from: before, to: after };
  }
  if (!Object.keys(changes).length) throw fail("No hay cambios que guardar.");
  const update = Object.fromEntries(Object.keys(changes).map((field) => [field, data[field]]));
  if (changes.responsibleId) update.responsible = data.responsible;
  if (changes.likelihood || changes.impact) {
    update.riskScore = data.riskScore;
    update.risk = data.risk;
  }
  return { current, changes, update };
};

const editAuditForUser = async (user, id, body, options = {}) => {
  await activeEditor(user);
  const existing = await planningRepository.findById(id);
  if (options.operationId && existing?.aiEditOperationId === options.operationId) {
    await assertWritableRecordScope(user, existing);
    return { audit: existing, changes: {} };
  }
  const prepared = await prepareAuditEdit(user, id, body, options.expected || {});
  const latest = await planningRepository.findById(id);
  await activeEditor(user);
  if (!latest || latest.updatedAt !== prepared.current.updatedAt ||
      latest.storageVersion !== prepared.current.storageVersion) {
    throw fail("La auditoría cambió mientras se guardaba. Revísala otra vez.", 409);
  }
  await assertWritableRecordScope(user, latest);
  const audit = await planningRepository.update(id, {
    ...prepared.update,
    ...(options.operationId ? { aiEditOperationId: options.operationId } : {})
  }, latest.storageVersion);
  if (!audit) throw fail("La auditoría dejó de estar disponible.", 409);
  await logActivity({ actor: user, action: "AUDIT_UPDATED", details: {
    proposalId: audit.id, title: audit.title, status: audit.status, changes: prepared.changes,
    ...(options.reason ? { reason: options.reason } : {})
  } });
  return { audit, changes: prepared.changes };
};

module.exports = { prepareAuditEdit, editAuditForUser };
