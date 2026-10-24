const unitRepository = require("../repositories/orgUnitRepository");
const grantRepository = require("../repositories/orgGrantRepository");
const { ROLES } = require("../config/roles");

const effective = (unit, today) => unit && unit.status === "ACTIVE" && unit.effectiveFrom <= today;
const todayUtc = () => new Date().toISOString().slice(0, 10);
const present = (unit, accessLevel, accessSource) => ({
  id: unit.id, code: unit.code, name: unit.name, kind: unit.kind, accessLevel, accessSource
});

// Scope grants are direct. Module-specific role permissions remain a separate AND condition.
const accessLevelFor = async (user, unitId, today = todayUtc()) => {
  const unit = await unitRepository.findById(unitId);
  if (!effective(unit, today)) return null;
  if (user.role === ROLES.SUPER_ADMIN) return "MANAGE";
  const grant = await grantRepository.findActive(unitId, user.id);
  return grant?.accessLevel || null;
};
const canViewScope = async (user, unitId, today) =>
  (await accessLevelFor(user, unitId, today)) !== null;
const canManageScope = async (user, unitId, today) =>
  (await accessLevelFor(user, unitId, today)) === "MANAGE";
const availableScopesFor = async (user, today = todayUtc()) => {
  const units = await unitRepository.getAll();
  const active = units.filter((unit) => effective(unit, today));
  if (user.role === ROLES.SUPER_ADMIN) {
    return active.map((unit) => present(unit, "MANAGE", "SUPER_ADMIN"));
  }
  const grants = await grantRepository.listActiveByUser(user.id);
  const byUnit = new Map(grants.map((grant) => [grant.unitId, grant.accessLevel]));
  return active.filter((unit) => byUnit.has(unit.id))
    .map((unit) => present(unit, byUnit.get(unit.id), "DIRECT"));
};

module.exports = { accessLevelFor, canViewScope, canManageScope, availableScopesFor };
