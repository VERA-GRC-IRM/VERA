const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_org_units");

const findByCode = async (code) =>
  (await store.getAll({ code: `eq.${code}` }))[0] || null;
const create = (unit) => store.create(unit, {
  code: unit.code,
  kind: unit.kind,
  parent_id: unit.parentId
});

module.exports = { getAll: store.getAll, findById: store.findById, findByCode, create };
