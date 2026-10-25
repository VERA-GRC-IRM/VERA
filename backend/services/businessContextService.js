const { randomUUID } = require("node:crypto");
const repository = require("../repositories/businessContextRepository");
const { availableScopesFor } = require("./scopeAccessService");
const { logActivity } = require("./auditLogger");
const { ROLES } = require("../config/roles");

const KINDS = Object.freeze(["PROCESS", "SERVICE", "OBJECTIVE"]);
const RELATIONS = Object.freeze({
  DELIVERS_SERVICE: { source: ["PROCESS"], target: "SERVICE" },
  SUPPORTS_OBJECTIVE: { source: ["PROCESS", "SERVICE"], target: "OBJECTIVE" }
});
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
const definitionFrom = (input) => {
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
  return { name, description, sourceNote, effectiveFrom, effectiveTo, unitIds: [...input.unitIds] };
};
const assertAvailableUnits = async (user, unitIds) => {
  const available = new Set((await availableScopesFor(user)).map((scope) => scope.id));
  if (unitIds.some((id) => !available.has(id))) throw errorFor("Una unidad ya no está disponible.", 400);
};
const resolveRelationships = async (input, sourceKind, sourceId, sourceUnitIds) => {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 12) {
    throw errorFor("Selecciona hasta 12 relaciones del mapa del negocio.", 400);
  }
  if (!input.length) return [];
  const records = await repository.getAll();
  const chosen = new Set();
  return input.map((link) => {
    const rule = RELATIONS[link?.relationType];
    const targetContextId = link?.targetContextId;
    const targetRevision = link?.targetRevision;
    const key = `${link?.relationType}:${targetContextId}`;
    if (!rule || !rule.source.includes(sourceKind) ||
        typeof targetContextId !== "string" || targetContextId === sourceId ||
        !Number.isSafeInteger(targetRevision) || targetRevision < 1 || chosen.has(key)) {
      throw errorFor("La relación entre conceptos no es válida o está duplicada.", 400);
    }
    chosen.add(key);
    const rationale = field(link.rationale, "Justificación de la relación", 10, 500);
    const target = records.find((record) => record.contextId === targetContextId &&
      record.revision === targetRevision && record.kind === rule.target && record.status === "ACTIVE");
    const sharedUnitIds = target ? sourceUnitIds.filter((id) => target.unitIds.includes(id)) : [];
    if (!sharedUnitIds.length) throw errorFor("Los conceptos relacionados deben compartir al menos un ámbito activo.", 400);
    return { relationType: link.relationType, targetContextId, targetRevision,
      targetName: target.name, targetCode: target.code, rationale, sharedUnitIds };
  });
};
const project = (record, visibleIds) => {
  const unitIds = record.unitIds.filter((id) => visibleIds.has(id));
  if (!unitIds.length) return null;
  const visibleRecord = { ...record };
  delete visibleRecord.createdBy;
  delete visibleRecord.storageVersion;
  const relationships = (record.relationships || [])
    .filter((link) => link.sharedUnitIds?.some((id) => visibleIds.has(id)))
    .map(({ relationType, targetContextId, targetRevision, targetName, targetCode, rationale }) =>
      ({ relationType, targetContextId, targetRevision, targetName, targetCode, rationale }));
  return { ...visibleRecord, unitIds, relationships,
    publishedBy: record.createdBy?.username || "Usuario" };
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
  return [...latest.values()].map((record) => project(record, visibleIds))
    .filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "es"));
};

const revisionsForUser = async (user, contextId) => {
  if (typeof contextId !== "string" || !/^CTX-[0-9a-f-]{36}$/i.test(contextId)) {
    throw errorFor("Selecciona un concepto válido.", 400);
  }
  const [all, scopes] = await Promise.all([repository.getAll(), availableScopesFor(user)]);
  const visibleIds = new Set(scopes.map((scope) => scope.id));
  const versions = all.filter((record) => record.contextId === contextId).sort((a, b) => b.revision - a.revision);
  const visibleVersions = versions.map((record) => project(record, visibleIds)).filter(Boolean);
  if (!visibleVersions.length) throw errorFor("Concepto no disponible.", 404);
  return visibleVersions;
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
  const definition = definitionFrom(input);
  await assertAvailableUnits(user, definition.unitIds);
  if (await repository.findByCode(kind, code)) throw errorFor("Ya existe ese código para el tipo elegido.", 409);
  const contextId = `CTX-${randomUUID()}`;
  const relationships = await resolveRelationships(input.relationships, kind, contextId, definition.unitIds);
  const record = await repository.create({
    id: `${contextId}:1`, contextId, revision: 1, kind, code, ...definition, relationships,
    status: "ACTIVE", createdAt: new Date().toISOString(),
    createdBy: { id: user.id, username: user.username }
  });
  await logActivity({ actor: user, action: "BUSINESS_CONTEXT_CREATED",
    details: { contextId, kind, code, unitIds: record.unitIds } });
  return record;
};

const publishRevisionForUser = async (user, contextId, input) => {
  if (user.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede publicar este catálogo.", 403);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errorFor("Envía una revisión válida.", 400);
  const reason = field(input.changeReason, "Motivo del cambio", 10, 500);
  const definition = definitionFrom(input);
  await assertAvailableUnits(user, definition.unitIds);
  const versions = (await repository.getAll()).filter((record) => record.contextId === contextId)
    .sort((a, b) => b.revision - a.revision);
  const latest = versions[0];
  if (!latest) throw errorFor("Concepto no disponible.", 404);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== latest.revision) {
    throw errorFor("La ficha cambió mientras la revisabas. Actualiza antes de publicar.", 409);
  }
  if (definition.effectiveFrom < latest.effectiveFrom) {
    throw errorFor("La nueva versión no puede iniciar antes que la anterior.", 400);
  }
  const relationships = await resolveRelationships(input.relationships === undefined
    ? (latest.relationships || []).map(({ relationType, targetContextId, targetRevision, rationale }) =>
      ({ relationType, targetContextId, targetRevision, rationale })) : input.relationships,
  latest.kind, contextId, definition.unitIds);
  const record = await repository.create({
    id: `${contextId}:${latest.revision + 1}`, contextId, revision: latest.revision + 1,
    kind: latest.kind, code: latest.code, ...definition, relationships, changeReason: reason,
    status: "ACTIVE", createdAt: new Date().toISOString(),
    createdBy: { id: user.id, username: user.username }
  });
  await logActivity({ actor: user, action: "BUSINESS_CONTEXT_REVISED",
    details: { contextId, revision: record.revision, kind: record.kind, code: record.code, changeReason: reason } });
  return record;
};

module.exports = { KINDS, RELATIONS, listForUser, revisionsForUser,
  createForUser, publishRevisionForUser, resolveReferencesForUnit };
