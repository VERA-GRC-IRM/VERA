const { randomUUID } = require("node:crypto");
const repository = require("../repositories/orgUnitRepository");
const { logActivity } = require("./auditLogger");
const { ROLES } = require("../config/roles");

const KINDS = Object.freeze(["GROUP", "LEGAL_ENTITY", "BUSINESS_UNIT", "SITE"]);
const PARENT_KINDS = Object.freeze({
  GROUP: [],
  LEGAL_ENTITY: ["GROUP", "LEGAL_ENTITY"],
  BUSINESS_UNIT: ["LEGAL_ENTITY", "BUSINESS_UNIT"],
  SITE: ["LEGAL_ENTITY", "BUSINESS_UNIT"]
});
const errorFor = (message, status) => Object.assign(new Error(message), { status });
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const parseUnit = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw errorFor("Envía una unidad válida.", 400);
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const kind = String(body.kind ?? "").trim();
  const parentId = body.parentId === null || body.parentId === undefined ? null : String(body.parentId).trim();
  const externalReference = body.externalReference === null || body.externalReference === undefined
    ? null : String(body.externalReference).trim();
  const effectiveFrom = body.effectiveFrom === undefined
    ? new Date().toISOString().slice(0, 10) : body.effectiveFrom;
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw errorFor("El código debe tener 2 a 32 letras, números, guiones o guiones bajos.", 400);
  if (name.length < 3 || name.length > 120) throw errorFor("El nombre debe tener entre 3 y 120 caracteres.", 400);
  if (!KINDS.includes(kind)) throw errorFor("Selecciona un tipo de unidad válido.", 400);
  if (parentId !== null && (parentId.length < 4 || parentId.length > 80)) throw errorFor("Selecciona una unidad superior válida.", 400);
  if (externalReference !== null && externalReference.length > 80) throw errorFor("La referencia externa admite hasta 80 caracteres.", 400);
  if (!validDate(effectiveFrom)) throw errorFor("La fecha de vigencia debe ser AAAA-MM-DD.", 400);
  return { code, name, kind, parentId, externalReference: externalReference || null, effectiveFrom };
};

const createOrgUnitForUser = async (user, body) => {
  if (user.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede administrar unidades.", 403);
  const data = parseUnit(body);
  if (await repository.findByCode(data.code)) throw errorFor("Ya existe una unidad con ese código.", 409);
  const parent = data.parentId ? await repository.findById(data.parentId) : null;
  if (data.parentId && !parent) throw errorFor("La unidad superior no existe.", 400);
  if (data.kind === "GROUP" && data.parentId) throw errorFor("Un grupo no puede tener unidad superior.", 400);
  if (data.kind !== "GROUP" && !parent) throw errorFor("Selecciona una unidad superior.", 400);
  if (parent && !PARENT_KINDS[data.kind].includes(parent.kind)) {
    throw errorFor("La unidad superior no corresponde al tipo seleccionado.", 400);
  }
  if (parent && parent.effectiveFrom > data.effectiveFrom) {
    throw errorFor("La unidad no puede iniciar antes que su unidad superior.", 400);
  }
  const unit = await repository.create({
    ...data, id: `ORG-${randomUUID()}`, status: "ACTIVE",
    createdAt: new Date().toISOString(), createdBy: { id: user.id, username: user.username }
  });
  await logActivity({ actor: user, action: "ORG_UNIT_CREATED",
    details: { unitId: unit.id, code: unit.code, kind: unit.kind, parentId: unit.parentId } });
  return unit;
};

module.exports = { KINDS, PARENT_KINDS, parseUnit, createOrgUnitForUser };
