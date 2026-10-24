const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const unitRepository = require("../repositories/orgUnitRepository");
const grantRepository = require("../repositories/orgGrantRepository");
const { logActivity } = require("./auditLogger");
const { USER_STATUS } = require("../config/accountRules");
const { ROLES } = require("../config/roles");

const errorFor = (message, status) => Object.assign(new Error(message), { status });
const ACCESS_LEVELS = Object.freeze(["VIEW", "MANAGE"]);
const requireAdmin = (actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede administrar ámbitos.", 403);
};
const createGrantForUser = async (actor, unitId, body) => {
  requireAdmin(actor);
  const userId = Number(body?.userId);
  const accessLevel = String(body?.accessLevel ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  if (!Number.isSafeInteger(userId) || userId <= 0) throw errorFor("Selecciona una cuenta válida.", 400);
  if (!ACCESS_LEVELS.includes(accessLevel)) throw errorFor("Selecciona VIEW o MANAGE.", 400);
  if (reason.length < 10 || reason.length > 500) throw errorFor("El motivo debe tener entre 10 y 500 caracteres.", 400);
  const unit = await unitRepository.findById(unitId);
  if (!unit || unit.status !== "ACTIVE") throw errorFor("El ámbito no está disponible.", 404);
  const user = await userRepository.findById(userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) throw errorFor("La cuenta no está activa.", 400);
  if (await grantRepository.findActive(unitId, userId)) throw errorFor("Ya existe una autorización activa para esta cuenta y ámbito.", 409);
  const grant = await grantRepository.create({
    id: `ORG-GRANT-${randomUUID()}`, unitId, userId, accessLevel, reason,
    status: "ACTIVE", grantedAt: new Date().toISOString(),
    grantedBy: { id: actor.id, username: actor.username }, revokedAt: null, revokedBy: null
  });
  await logActivity({ actor, action: "ORG_GRANT_CREATED",
    details: { grantId: grant.id, unitId, userId, accessLevel, reason } });
  return grant;
};
const revokeGrantForUser = async (actor, id, body) => {
  requireAdmin(actor);
  const reason = String(body?.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 500) throw errorFor("El motivo debe tener entre 10 y 500 caracteres.", 400);
  const current = await grantRepository.findById(id);
  if (!current) throw errorFor("Autorización no encontrada.", 404);
  if (current.status !== "ACTIVE") throw errorFor("La autorización ya fue revocada.", 409);
  const revoked = await grantRepository.revoke(id, {
    revokedAt: new Date().toISOString(), revokedBy: { id: actor.id, username: actor.username },
    revokeReason: reason
  }, current.storageVersion);
  await logActivity({ actor, action: "ORG_GRANT_REVOKED",
    details: { grantId: id, unitId: revoked.unitId, userId: revoked.userId, reason } });
  return revoked;
};

module.exports = { ACCESS_LEVELS, createGrantForUser, revokeGrantForUser };
