const { assertWritableRecordScope } = require("./recordScopeVisibility");

const errorFor = (message, status) => Object.assign(new Error(message), { status });
const requestedScope = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^ORG-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    throw errorFor("Selecciona un ámbito empresarial válido.", 400);
  }
  return value.trim();
};

// Related records are checked for write access before calling this function.
// Scope is chosen explicitly only for an independent record; linked records inherit it.
const scopeForNewRecord = async (user, rawScope, parents = []) => {
  const requested = requestedScope(rawScope);
  const parentScopes = parents.map((parent) => parent.orgUnitId || null);
  if (new Set(parentScopes).size > 1 || (parents.length && requested && requested !== parentScopes[0])) {
    throw errorFor("Los registros relacionados deben pertenecer al mismo ámbito.", 409);
  }
  const orgUnitId = parents.length ? parentScopes[0] : requested;
  if (orgUnitId) await assertWritableRecordScope(user, { orgUnitId });
  return orgUnitId;
};

module.exports = { scopeForNewRecord };
