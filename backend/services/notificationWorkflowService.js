const planningRepository = require("../repositories/planningRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const actionRepository = require("../repositories/actionRepository");
const readRepository = require("../repositories/notificationReadRepository");
const userRepository = require("../repositories/userRepository");
const { visibleActionsFromGroups } = require("./actionService");
const { buildNotifications } = require("./notificationService");
const { logActivity } = require("./auditLogger");
const { RECORD_CREATE_ROLES } = require("../config/roles");
const { filterByVisibleScope } = require("./recordScopeVisibility");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const activeUser = async (user) => {
  const current = await userRepository.findById(user.id);
  if (!current || current.status !== "ACTIVE" || current.role !== user.role) {
    throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
};

const visibleNotifications = async (user, offsetMinutes = 0) => {
  await activeUser(user);
  const [proposals, groups, allEvidence, actionResult] = await Promise.all([
    Promise.resolve().then(() => planningRepository.getAll()).then((items) => filterByVisibleScope(user, items)),
    visibleCollectionsForUser(user),
    evidenceRepository.getAll(),
    Promise.resolve().then(() => actionRepository.getAll()).then((actions) => ({ actions }), () => ({ unavailable: true }))
  ]);
  const visibleIds = Object.fromEntries(Object.entries(groups).map(([type, items]) =>
    [type, new Set(items.map((item) => item.id))]));
  const evidence = allEvidence.filter((item) =>
    visibleIds[item.entityType]?.has(item.entityId));
  let actions = [];
  let actionAlertsAvailable = !actionResult.unavailable;
  if (actionAlertsAvailable) {
    try { actions = visibleActionsFromGroups(actionResult.actions, groups); }
    catch { actionAlertsAvailable = false; }
  }
  const current = buildNotifications({ proposals, actions, risks: groups.RISK,
    controls: groups.CONTROL, findings: groups.FINDING, evidence, user, offsetMinutes });
  const reads = new Map((await readRepository.syncForUser(user.id, current))
    .map((item) => [item.notificationId, item.readAt]));
  return { notifications: current
    .map((item) => ({ ...item, readAt: reads.get(item.id) || null })), actionAlertsAvailable };
};

const prepareReadChange = async (user, notificationId, read, offsetMinutes = 0) => {
  if (!RECORD_CREATE_ROLES.includes(user.role)) throw fail("Tu rol no puede cambiar la lectura de avisos.", 403);
  const result = await visibleNotifications(user, offsetMinutes);
  const item = result.notifications.find((entry) => entry.id === notificationId);
  if (!item) throw fail("El aviso no existe o ya no está visible para tu cuenta.", 404);
  if (!result.actionAlertsAvailable && item.type.startsWith("ACTION_")) {
    throw fail("Los avisos de compromisos están temporalmente incompletos.", 503);
  }
  return item;
};

const changeReadStateForUser = async (user, notificationId, read, options = {}) => {
  const item = await prepareReadChange(user, notificationId, read, options.offsetMinutes || 0);
  if (options.expectedReadAt !== undefined && item.readAt !== options.expectedReadAt) {
    throw fail("La lectura del aviso cambió desde la vista previa. Revísalo otra vez.", 409);
  }
  if (read === Boolean(item.readAt)) return { notificationId: item.id, readAt: item.readAt };
  const readAt = read ? await readRepository.markRead(user.id, item.id) : null;
  if (!read) await readRepository.markUnread(user.id, item.id);
  const subject = item.type.startsWith("ACTION_") ? { actionId: item.entityId }
    : item.type.startsWith("EVIDENCE_") ? { evidenceId: item.entityId }
      : item.type.startsWith("FINDING_") ? { findingId: item.entityId }
        : { proposalId: item.entityId };
  await logActivity({ actor: user, action: read ? "NOTIFICATION_READ" : "NOTIFICATION_UNREAD",
    details: { notificationId: item.id, ...subject } });
  return { notificationId: item.id, readAt };
};

module.exports = { visibleNotifications, prepareReadChange, changeReadStateForUser };
