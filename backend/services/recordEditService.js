const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const userRepository = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { parseCore: parseRiskCore } = require("./riskCreationService");
const { resolveReferencesForUnit } = require("./businessContextService");
const { parseCore: parseControlCore } = require("./controlCreationService");
const { logActivity } = require("./auditLogger");
const { assertWritableRecordScope, assertWritableRiskAuditLink,
  assertWritableControlScope } = require("./recordWriteScopeService");

const fields = {
  RISK: new Set(["title", "description", "area", "category", "causes", "consequences", "responsePlan"]),
  CONTROL: new Set(["title", "description", "type", "frequency"])
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const repositoryFor = (type) => type === "RISK" ? riskRepository : type === "CONTROL" ? controlRepository : null;
const parseFor = (type) => type === "RISK" ? parseRiskCore : type === "CONTROL" ? parseControlCore : null;
const assertWritable = async (user, type, record) => {
  if (type === "RISK") {
    await assertWritableRecordScope(user, record);
    await assertWritableRiskAuditLink(user, record);
  } else if (type === "CONTROL") await assertWritableControlScope(user, record);
};
const activeEditor = async (user) => {
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) throw fail("Tu rol no puede editar este registro.", 403);
};

const prepareRecordEdit = async (user, type, id, field, value) => {
  await activeEditor(user);
  if (!fields[type]?.has(field)) throw fail("Campo de edición no permitido.");
  const repository = repositoryFor(type);
  const current = await repository.findById(id);
  if (!current) throw fail("El registro no existe o dejó de estar disponible.", 404);
  await assertWritable(user, type, current);
  if (typeof value !== "string" || !value.trim() || current[field] === value.trim()) {
    throw fail("Indica un valor nuevo para el campo.");
  }
  const parsed = await parseFor(type)({ ...current, [field]: value.trim() });
  if (parsed.error) throw fail(parsed.error);
  if (type === "RISK" && await riskRepository.findDuplicate({ ...parsed.data, orgUnitId: current.orgUnitId }, current.id)) {
    throw fail("Ya existe un riesgo con el mismo nombre y área.", 409);
  }
  return { current, data: parsed.data, field, value: value.trim() };
};

const updateCoreForUser = async (user, type, id, input, options = {}) => {
  await activeEditor(user);
  const repository = repositoryFor(type);
  if (!repository) throw fail("Tipo de registro no permitido.");
  const current = await repository.findById(id);
  if (!current) throw fail("El registro no existe o dejó de estar disponible.", 404);
  await assertWritable(user, type, current);
  if (options.operationId && current.aiEditOperationId === options.operationId) return current;
  if (options.expectedUpdatedAt !== undefined && current.updatedAt !== options.expectedUpdatedAt) {
    throw fail("El registro cambió desde la vista previa. Vuelve a revisarlo.", 409);
  }
  if (options.expectedStorageVersion !== undefined &&
      current.storageVersion !== options.expectedStorageVersion) {
    throw fail("El registro cambió desde la vista previa. Vuelve a revisarlo.", 409);
  }
  if (options.expectedField && current[options.expectedField] !== options.expectedValue) {
    throw fail("El campo cambió desde la vista previa. Vuelve a revisarlo.", 409);
  }
  const parsed = await parseFor(type)(type === "RISK" ? { ...current, ...input } : input);
  if (parsed.error) throw fail(parsed.error);
  const businessContextReferences = type === "RISK"
    ? await resolveReferencesForUnit(user, input.businessContextReferences, current.orgUnitId)
    : undefined;
  await assertWritable(user, type, { ...current, ...parsed.data });
  if (type === "RISK" && await riskRepository.findDuplicate({ ...parsed.data, orgUnitId: current.orgUnitId }, id)) {
    throw fail("Ya existe un riesgo con el mismo nombre y área.", 409);
  }
  const latest = await repository.findById(id);
  await activeEditor(user);
  if (!latest || latest.updatedAt !== current.updatedAt || latest.storageVersion !== current.storageVersion) {
    throw fail("El registro cambió mientras se guardaba. Vuelve a revisarlo.", 409);
  }
  await assertWritable(user, type, latest);
  const updated = await repository.update(id, { ...parsed.data,
    ...(businessContextReferences !== undefined ? { businessContextReferences } : {}),
    ...(options.operationId ? { aiEditOperationId: options.operationId } : {}) }, latest.storageVersion);
  if (!updated) throw fail("El registro dejó de estar disponible.", 409);
  await logActivity({ actor: user, action: type === "RISK" ? "RISK_UPDATED" : "CONTROL_UPDATED",
    details: { [type === "RISK" ? "riskId" : "controlId"]: updated.id, title: updated.title,
      ...(options.field ? { field: options.field } : {}),
      ...(options.reason ? { reason: options.reason } : {}) } });
  return updated;
};

const updateSingleFieldForUser = async (user, type, id, field, value, reason, expected, operationId) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId || "")) {
    throw fail("La operación no es válida.");
  }
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 300) {
    throw fail("Explica el motivo de la edición en 10 a 300 caracteres.");
  }
  await activeEditor(user);
  const existing = await repositoryFor(type)?.findById(id);
  if (existing?.aiEditOperationId === operationId) {
    await assertWritable(user, type, existing);
    return existing;
  }
  const prepared = await prepareRecordEdit(user, type, id, field, value);
  if (prepared.current.updatedAt !== expected?.updatedAt ||
      prepared.current[field] !== expected?.value) {
    throw fail("El registro cambió desde la vista previa. Vuelve a revisarlo.", 409);
  }
  return updateCoreForUser(user, type, id, { ...prepared.current, [field]: value }, {
    expectedUpdatedAt: expected.updatedAt, expectedField: field, expectedValue: expected.value,
    field, reason, operationId
  });
};

const updateOfflineDescriptionForUser = async (user, type, id, input) => {
  const expected = input?.expected;
  const reason = input?.reason;
  if (!Number.isSafeInteger(expected?.storageVersion) || expected.storageVersion < 1 ||
      !(expected.updatedAt === null || typeof expected.updatedAt === "string") ||
      typeof expected.description !== "string") {
    throw fail("Indica la versión y descripción original del registro.");
  }
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 300) {
    throw fail("Explica el motivo de la edición en 10 a 300 caracteres.");
  }
  await activeEditor(user);
  const current = await repositoryFor(type)?.findById(id);
  if (!current) throw fail("El registro no existe o dejó de estar disponible.", 404);
  await assertWritable(user, type, current);
  if (current.storageVersion !== expected.storageVersion ||
      current.updatedAt !== expected.updatedAt || current.description !== expected.description) {
    throw fail("El registro cambió desde que preparaste el borrador. Revisa el valor actual.", 409);
  }
  const prepared = await prepareRecordEdit(user, type, id, "description", input.description);
  if (prepared.current.storageVersion !== expected.storageVersion ||
      prepared.current.updatedAt !== expected.updatedAt ||
      prepared.current.description !== expected.description) {
    throw fail("El registro cambió desde que preparaste el borrador. Revisa el valor actual.", 409);
  }
  return updateCoreForUser(user, type, id, { ...prepared.current, description: prepared.value }, {
    expectedUpdatedAt: expected.updatedAt, expectedStorageVersion: expected.storageVersion,
    expectedField: "description", expectedValue: expected.description,
    field: "description", reason: reason.trim()
  });
};

module.exports = { fields, prepareRecordEdit, updateCoreForUser, updateSingleFieldForUser,
  updateOfflineDescriptionForUser };
