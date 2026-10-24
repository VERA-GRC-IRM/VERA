const grants = [];
const copy = (grant) => ({ ...grant, grantedBy: { ...grant.grantedBy },
  revokedBy: grant.revokedBy ? { ...grant.revokedBy } : null });
const getAll = () => grants.map(copy);
const listByUnit = (unitId) => grants.filter((grant) => grant.unitId === unitId).map(copy);
const listActiveByUser = (userId) => grants.filter((grant) =>
  grant.userId === userId && grant.status === "ACTIVE").map(copy);
const findById = (id) => {
  const grant = grants.find((item) => item.id === id);
  return grant ? copy(grant) : null;
};
const findActive = (unitId, userId) => {
  const grant = grants.find((item) => item.unitId === unitId && item.userId === userId && item.status === "ACTIVE");
  return grant ? copy(grant) : null;
};
const create = (grant) => {
  const saved = { ...grant, storageVersion: 1 };
  grants.push(saved);
  return copy(saved);
};
const revoke = (id, changes, expectedVersion) => {
  const grant = grants.find((item) => item.id === id);
  if (!grant) return null;
  if (expectedVersion !== undefined && grant.storageVersion !== expectedVersion) {
    throw Object.assign(new Error("La autorización cambió mientras la revisabas."), { status: 409 });
  }
  Object.assign(grant, changes, { status: "REVOKED", storageVersion: grant.storageVersion + 1,
    updatedAt: new Date().toISOString() });
  return copy(grant);
};

module.exports = process.env.VERA_ORG_STORE === "supabase"
  ? require("./supabaseOrgGrantRepository")
  : { getAll, listByUnit, listActiveByUser, findById, findActive, create, revoke };
