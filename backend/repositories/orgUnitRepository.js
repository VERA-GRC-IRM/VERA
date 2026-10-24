const units = [];
const copy = (unit) => ({ ...unit, createdBy: { ...unit.createdBy } });
const getAll = () => units.map(copy);
const findById = (id) => units.find((unit) => unit.id === id) || null;
const findByCode = (code) => units.find((unit) => unit.code === code) || null;
const create = (unit) => {
  units.push(copy(unit));
  return copy(unit);
};

module.exports = process.env.VERA_ORG_STORE === "supabase"
  ? require("./supabaseOrgUnitRepository")
  : { getAll, findById, findByCode, create };
