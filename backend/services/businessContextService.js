const { randomUUID } = require("node:crypto");
const repository = require("../repositories/businessContextRepository");
const { availableScopesFor } = require("./scopeAccessService");
const { logActivity } = require("./auditLogger");
const { ROLES } = require("../config/roles");

const KINDS = Object.freeze(["PROCESS", "SERVICE", "OBJECTIVE"]);
const errorFor = (message, status) => Object.assign(new Error(message), { status });
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const field = (value, label, min, max) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw errorFor(`${label}: escribe entre ${min} y ${max} caracteres.`, 400);
  }
  return value.trim();
};

const listForUser = async (user) => {
  const [records, scopes] = await Promise.all([repository.getAll(), availableScopesFor(user)]);
  const visibleIds = new Set(scopes.map((scope) => scope.id));
  const latest = new Map();
  for (const record of records) {
    if (!latest.has(record.contextId) || latest.get(record.contextId).revision < record.revision) {
      latest.set(record.contextId, record);
    }
  }
  return [...latest.values()].map((record) => {
    const unitIds = record.unitIds.filter((id) => visibleIds.has(id));
    if (!unitIds.length) return null;
    const visibleRecord = { ...record };
    delete visibleRecord.createdBy;
    delete visibleRecord.storageVersion;
    return { ...visibleRecord, unitIds };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "es"));
};

const resolveReferencesForUnit = async (user, references, orgUnitId) => {
  if (references === undefined) return undefined;
  if (!Array.isArray(references) || references.length > 12) {
    throw errorFor("Selecciona hasta 12 elementos del mapa del negocio.", 400);
  }
  if (!references.length) return [];
  if (!orgUnitId) throw errorFor("Asigna primero un ámbito empresarial al riesgo.", 400);
  if (process.env.VERA_RISK_CONTROL_STORE === "supabase" &&
      process.env.VERA_BUSINESS_CONTEXT_STORE !== "supabase") {
    throw errorFor("El mapa del negocio debe tener persistencia activa para vincularlo con riesgos.", 409);
  }
  const [records, scopes] = await Promise.all([repository.getAll(), availableScopesFor(user)]);
  if (!scopes.some((scope) => scope.id === orgUnitId)) throw errorFor("El ámbito ya no está disponible.", 404);
  const selected = new Set();
  return references.map((reference) => {
    const contextId = reference?.contextId;
    const revision = reference?.revision;
    if (typeof contextId !== "string" || !Number.isSafeInteger(revision) || revision < 1 || selected.has(contextId)) {
      throw errorFor("Selecciona versiones válidas y distintas del mapa del negocio.", 400);
    }
    selected.add(contextId);
    const record = records.find((item) => item.contextId === contextId && item.revision === revision &&
      item.status === "ACTIVE" && item.unitIds.includes(orgUnitId));
    if (!record) throw errorFor("Un elemento del mapa no está vigente o no aplica al ámbito del riesgo.", 400);
    return { contextId, revision, kind: record.kind, code: record.code, name: record.name };
  });
};

const createForUser = async (user, input) => {
  if (user.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede publicar este catálogo.", 403);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errorFor("Envía un registro válido.", 400);
  const kind = String(input.kind ?? "").trim();
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!KINDS.includes(kind)) throw errorFor("Selecciona proceso, servicio u objetivo.", 400);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw errorFor("El código debe tener 2 a 32 caracteres válidos.", 400);
  const name = field(input.name, "Nombre", 3, 120);
  const description = field(input.description, "Descripción", 10, 2000);
  const sourceNote = input.sourceNote == null || input.sourceNote === ""
    ? null : field(input.sourceNote, "Fuente", 3, 500);
  const effectiveFrom = input.effectiveFrom;
  const effectiveTo = input.effectiveTo || null;
  if (!validDate(effectiveFrom) || (effectiveTo && (!validDate(effectiveTo) || effectiveTo <= effectiveFrom))) {
    throw errorFor("Indica un periodo válido; el fin debe ser posterior al inicio.", 400);
  }
  if (!Array.isArray(input.unitIds) || input.unitIds.length < 1 || input.unitIds.length > 20 ||
      input.unitIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(input.unitIds).size !== input.unitIds.length) {
    throw errorFor("Selecciona de 1 a 20 unidades distintas.", 400);
  }
  const available = new Set((await availableScopesFor(user)).map((scope) => scope.id));
  if (input.unitIds.some((id) => !available.has(id))) throw errorFor("Una unidad ya no está disponible.", 400);
  if (await repository.findByCode(kind, code)) throw errorFor("Ya existe ese código para el tipo elegido.", 409);
  const contextId = `CTX-${randomUUID()}`;
  const record = await repository.create({
    id: `${contextId}:1`, contextId, revision: 1, kind, code, name, description,
    unitIds: [...input.unitIds], effectiveFrom, effectiveTo, sourceNote,
    status: "ACTIVE", createdAt: new Date().toISOString(),
    createdBy: { id: user.id, username: user.username }
  });
  await logActivity({ actor: user, action: "BUSINESS_CONTEXT_CREATED",
    details: { contextId, kind, code, unitIds: record.unitIds } });
  return record;
};

module.exports = { KINDS, listForUser, createForUser, resolveReferencesForUnit };
