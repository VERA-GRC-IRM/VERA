const repository = require("../repositories/presenceRepository");
const users = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { assertWritableRecordScope } = require("./recordScopeVisibility");
const { assertWritableControlScope } = require("./recordWriteScopeService");

const enabled = () => process.env.VERA_PRESENCE_ENABLED === "true" &&
  (!(process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") ||
    process.env.VERA_PRESENCE_STORE === "supabase");
const valid = (type, recordId) => ["RISK", "CONTROL"].includes(type) &&
  typeof recordId === "string" && /^[A-Za-z0-9-]{1,100}$/.test(recordId);
const validClient = (clientId) => typeof clientId === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId);
const ensureVisible = async (user, type, recordId) => {
  if (!valid(type, recordId)) return null;
  return visibleRecordForUser(user, type, recordId);
};
const canEdit = async (user, type, record) => {
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role) || user.roleTour) return false;
  try {
    if (type === "RISK") await assertWritableRecordScope(user, record);
    else await assertWritableControlScope(user, record);
    return true;
  } catch { return false; }
};
const heartbeat = async (req, res, next) => {
  if (!enabled()) return res.status(404).json({ message: "Presencia no disponible." });
  const { type, recordId, clientId } = req.body || {};
  if (!valid(type, recordId) || !validClient(clientId)) return res.status(400).json({ message: "Registro o sesión inválidos." });
  try {
    const record = await ensureVisible(req.user, type, recordId);
    if (!record) return res.status(404).json({ message: "Registro no disponible." });
    if (!await canEdit(req.user, type, record)) return res.status(403).json({ message: "No puedes editar este registro." });
    await repository.upsert(req.user.id, clientId, type, recordId);
    return res.status(204).end();
  } catch (error) { return next(error); }
};
const list = async (req, res, next) => {
  if (!enabled()) return res.status(404).json({ message: "Presencia no disponible." });
  const { type, recordId } = req.query;
  if (!valid(type, recordId)) return res.status(400).json({ message: "Registro inválido." });
  try {
    const record = await ensureVisible(req.user, type, recordId);
    if (!record) return res.status(404).json({ message: "Registro no disponible." });
    const active = await repository.list(type, recordId);
    const result = [];
    for (const userId of [...new Set(active.map((row) => row.user_id))].slice(0, 30)) {
      if (Number(userId) === Number(req.user.id)) continue;
      const actor = await users.findById(userId);
      if (!actor || actor.status !== "ACTIVE" || !await canEdit(actor, type, record) ||
          !await ensureVisible(actor, type, recordId)) continue;
      result.push({ name: String(actor.name || "Otra persona").slice(0, 100) });
    }
    return res.json({ editors: result });
  } catch (error) { return next(error); }
};
const leave = async (req, res, next) => {
  if (!enabled()) return res.status(404).json({ message: "Presencia no disponible." });
  if (!validClient(req.params.clientId)) return res.status(400).json({ message: "Sesión inválida." });
  try { await repository.remove(req.user.id, req.params.clientId); return res.status(204).end(); }
  catch (error) { return next(error); }
};
const cleanup = async (req, res, next) => {
  if (!enabled()) return res.status(404).json({ message: "Presencia no disponible." });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "No autorizado." });
  }
  try { return res.json({ removed: await repository.cleanupExpired() }); }
  catch (error) { return next(error); }
};
module.exports = { enabled, valid, validClient, heartbeat, list, leave, cleanup };
