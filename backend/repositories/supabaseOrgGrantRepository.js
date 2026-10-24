const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_org_grants");
const listByUnit = (unitId) => store.getAll({ unit_id: `eq.${unitId}` });
const findActive = async (unitId, userId) =>
  (await store.getAll({ unit_id: `eq.${unitId}`, user_id: `eq.${userId}`, status: "eq.ACTIVE" }))[0] || null;
const create = (grant) => store.create(grant, {
  unit_id: grant.unitId, user_id: grant.userId,
  access_level: grant.accessLevel, status: grant.status
});
const revoke = (id, changes, expectedVersion) =>
  store.mutate(id, { ...changes, status: "REVOKED" }, expectedVersion, { status: "REVOKED" });

module.exports = { getAll: store.getAll, listByUnit, findById: store.findById, findActive, create, revoke };
