const actionRepository = require("../repositories/actionRepository");
const findingRepository = require("../repositories/findingRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const userRepository = require("../repositories/userRepository");
const { logActivity } = require("./auditLogger");
const { buildAuditContext } = require("./auditContextService");
const { visibleCollectionsForUser, visibleRecordForUser } = require("./recordReadAccessService");
const { assertWritableSourceScope } = require("./recordWriteScopeService");
const { USER_STATUS } = require("../config/accountRules");
const { PLANNING_APPROVE_ROLES, RECORD_CREATE_ROLES } = require("../config/roles");
const { canReplayAction } = require("./creationReplayScope");
const notificationEvents = require("./notificationEventService");

const SOURCES = ["AUDIT", "RISK", "CONTROL", "FINDING"];
const STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
const TRANSITIONS = {
  OPEN: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "DONE", "CANCELLED"],
  DONE: ["OPEN"],
  CANCELLED: ["OPEN"]
};
const canTransition = (from, to) => STATUSES.includes(to) && TRANSITIONS[from]?.includes(to) === true;
const text = (value) => String(value ?? "").trim();
const actorName = (user) => user.name || user.username;
const actorEvent = (user, at) => ({ actorId: user.id, actorName: actorName(user), at });

class ActionError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.action = true;
  }
}

const assertSourceInput = (sourceType, sourceId) => {
  if (typeof sourceType !== "string" || typeof sourceId !== "string" ||
      !SOURCES.includes(sourceType) || !sourceId.trim() || sourceId.length > 80) {
    throw new ActionError("Selecciona un registro de origen válido.", 400);
  }
};

// La misma regla de lectura se aplica al creador, al responsable y a cada consulta posterior.
const visibleSource = async (user, sourceType, sourceId) => {
  return visibleRecordForUser(user, sourceType, sourceId);
};

const requiredSource = async (user, sourceType, sourceId) => {
  assertSourceInput(sourceType, sourceId);
  const source = await visibleSource(user, sourceType, sourceId);
  if (!source) throw new ActionError("El registro no existe o no está disponible para tu cuenta.", 404);
  return source;
};

const activeAssignee = async (id, sourceType, sourceId) => {
  const user = await userRepository.findById(id);
  if (!user || user.status !== USER_STATUS.ACTIVE || !RECORD_CREATE_ROLES.includes(user.role) ||
      !await visibleSource(user, sourceType, sourceId)) {
    throw new ActionError("Selecciona un responsable activo con acceso al registro.", 400);
  }
  return user;
};

const dateIsValid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const visibleCollections = visibleCollectionsForUser;

const listSources = async (user) => {
  const groups = await visibleCollections(user);
  return Object.entries(groups).flatMap(([sourceType, items]) => items.map((item) => ({
    sourceType, sourceId: item.id, title: item.title
  })));
};

const visibleActionsFromGroups = (actions, groups) => {
  const sourceIds = Object.fromEntries(Object.entries(groups).map(([type, items]) =>
    [type, new Set(items.map((item) => item.id))]));
  return actions.filter((action) => sourceIds[action.sourceType]?.has(action.sourceId));
};

const listActions = async (user, { sourceType, sourceId } = {}) => {
  if (sourceType || sourceId) assertSourceInput(sourceType, sourceId);
  if (sourceType) await requiredSource(user, sourceType, sourceId);
  if (sourceType) return (await actionRepository.getAll()).filter((action) =>
    action.sourceType === sourceType && action.sourceId === sourceId);
  const [actions, groups] = await Promise.all([actionRepository.getAll(), visibleCollections(user)]);
  return visibleActionsFromGroups(actions, groups);
};

const listActionsForAudit = async (user, auditId) => {
  let context;
  try { context = await buildAuditContext(user, auditId); }
  catch (error) {
    if ([400, 403, 404].includes(error.status)) throw new ActionError(error.message, error.status);
    throw error;
  }
  const related = {
    AUDIT: new Set([context.audit.id]),
    RISK: new Set(context.groups.risks.map((item) => item.id)),
    CONTROL: new Set(context.groups.controls.map((item) => item.id)),
    FINDING: new Set(context.groups.findings.map((item) => item.id))
  };
  const actions = (await actionRepository.getAll()).filter((action) =>
    related[action.sourceType]?.has(action.sourceId));
  return { actions, asOf: new Date().toISOString(), scope: context.scope };
};

const getAction = async (user, id) => {
  if (!id || id.length > 80) throw new ActionError("Selecciona una acción válida.", 400);
  const action = await actionRepository.findById(id);
  if (!action || !await visibleSource(user, action.sourceType, action.sourceId)) {
    throw new ActionError("La acción no existe o no está disponible para tu cuenta.", 404);
  }
  return action;
};

const listAssignees = async (user, sourceType, sourceId) => {
  await requiredSource(user, sourceType, sourceId);
  const people = (await userRepository.getAll()).filter((item) =>
    item.status === USER_STATUS.ACTIVE && RECORD_CREATE_ROLES.includes(item.role));
  const visible = [];
  for (const person of people) {
    if (await visibleSource(person, sourceType, sourceId)) {
      visible.push({ id: person.id, name: person.name, role: person.role });
    }
  }
  return visible;
};

const createAction = async (user, body, { operationId } = {}) => {
  const sourceType = text(body.sourceType);
  const sourceId = text(body.sourceId);
  const source = await requiredSource(user, sourceType, sourceId);
  await assertWritableSourceScope(user, sourceType, source);
  if (sourceType === "FINDING" && source.status !== "OPEN") {
    throw new ActionError("El hallazgo no está abierto; no se pueden añadir acciones.", 409);
  }
  const title = text(body.title);
  const rationale = text(body.rationale);
  const dueDate = text(body.dueDate);
  const assigneeId = Number(body.assigneeId);
  if (title.length < 3 || title.length > 140) throw new ActionError("El título debe tener entre 3 y 140 caracteres.", 400);
  if (rationale.length < 10 || rationale.length > 1000) throw new ActionError("El motivo debe tener entre 10 y 1,000 caracteres.", 400);
  if (!dateIsValid(dueDate)) throw new ActionError("Indica una fecha objetivo válida (AAAA-MM-DD).", 400);
  if (!Number.isSafeInteger(assigneeId) || assigneeId < 1) throw new ActionError("Selecciona una persona responsable.", 400);
  const assignee = await activeAssignee(assigneeId, sourceType, sourceId);
  if (operationId) {
    if (typeof operationId !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId)) {
      throw new ActionError("Identificador de operación inválido.", 400);
    }
    const existing = (await actionRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      if (!canReplayAction(existing, user, { sourceType, sourceId, title, rationale,
        dueDate, assigneeId, orgUnitId: source.orgUnitId || null })) {
        throw new ActionError("La operación no está disponible para este registro.", 409);
      }
      return existing;
    }
  }
  const now = new Date().toISOString();
  const action = await actionRepository.create({
    sourceType, sourceId, sourceTitle: source.title,
    orgUnitId: source.orgUnitId || null,
    title, rationale, dueDate, assigneeId, assigneeName: assignee.name,
    ...(sourceType === "FINDING" ? { sourceControlId: source.controlId,
      progressPercent: 0, evidenceIds: [], validationRequestedAt: null } : {}),
    ...(operationId ? { aiOperationId: operationId } : {}),
    status: "OPEN", createdBy: { id: user.id, name: user.name || user.username },
    createdAt: now, updatedAt: now, completedAt: null,
    history: [{ type: "CREATED", ...actorEvent(user, now) }]
  });
  await logActivity({ actor: user, action: "FOLLOW_UP_ACTION_CREATED", details: {
    actionId: action.id, sourceType, sourceId, assigneeId
  } });
  await notificationEvents.actionAssigned(action);
  return action;
};

const assertVersion = (value) => {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new ActionError("Actualiza la acción antes de cambiarla.", 400);
  return version;
};

const changeStatus = async (user, id, body) => {
  const action = await getAction(user, id);
  await assertWritableSourceScope(user, action.sourceType,
    await requiredSource(user, action.sourceType, action.sourceId));
  if (action.assigneeId !== user.id && !PLANNING_APPROVE_ROLES.includes(user.role)) {
    throw new ActionError("Solo el responsable o quien dirige la planeación puede cambiar el estado.", 403);
  }
  const status = text(body.status);
  if (action.sourceType === "FINDING") {
    const finding = await findingRepository.findById(action.sourceId);
    if (finding?.status !== "OPEN") {
      throw new ActionError("El hallazgo no está abierto; no se puede modificar esta acción.", 409);
    }
  }
  const note = text(body.note);
  if (!canTransition(action.status, status)) {
    throw new ActionError("La transición de estado no está permitida.", 409);
  }
  if (note.length < 10 || note.length > 1000) throw new ActionError("Explica el cambio en 10 a 1,000 caracteres.", 400);
  const now = new Date().toISOString();
  const updated = await actionRepository.mutate(id, {
    status, completedAt: ["DONE", "CANCELLED"].includes(status) ? now : null,
    ...(action.sourceType === "FINDING" ? { progressPercent: status === "DONE" ? 100
      : action.status === "DONE" ? 0 : action.progressPercent ?? 0,
    validationRequestedAt: status === "DONE" || action.status === "DONE" ? null : action.validationRequestedAt || null } : {}),
    history: [...action.history, { type: "STATUS_CHANGED", from: action.status, to: status, note,
      ...actorEvent(user, now) }]
  }, assertVersion(body.version));
  await logActivity({ actor: user, action: "FOLLOW_UP_ACTION_STATUS_CHANGED", details: {
    actionId: id, sourceType: action.sourceType, sourceId: action.sourceId, from: action.status, to: status
  } });
  return updated;
};

const reassign = async (user, id, body) => {
  const action = await getAction(user, id);
  await assertWritableSourceScope(user, action.sourceType,
    await requiredSource(user, action.sourceType, action.sourceId));
  const assigneeId = Number(body.assigneeId);
  const note = text(body.note);
  if (!Number.isSafeInteger(assigneeId) || assigneeId < 1) throw new ActionError("Selecciona una persona responsable.", 400);
  if (assigneeId === action.assigneeId) throw new ActionError("La acción ya tiene esa persona responsable.", 409);
  if (note.length < 10 || note.length > 1000) throw new ActionError("Explica el cambio en 10 a 1,000 caracteres.", 400);
  const assignee = await activeAssignee(assigneeId, action.sourceType, action.sourceId);
  const now = new Date().toISOString();
  const updated = await actionRepository.mutate(id, {
    assigneeId, assigneeName: assignee.name,
    history: [...action.history, { type: "REASSIGNED", fromId: action.assigneeId, fromName: action.assigneeName,
      toId: assigneeId, toName: assignee.name, note, actorId: user.id, actorName: user.name || user.username, at: now }]
  }, assertVersion(body.version));
  await logActivity({ actor: user, action: "FOLLOW_UP_ACTION_REASSIGNED", details: {
    actionId: id, sourceType: action.sourceType, sourceId: action.sourceId, fromId: action.assigneeId, toId: assigneeId
  } });
  await notificationEvents.actionAssigned(updated);
  return updated;
};

const editableFindingPlan = async (user, id, { assigneeOnly = false, allowClosedReplay = false } = {}) => {
  const action = await getAction(user, id);
  if (action.sourceType !== "FINDING") throw new ActionError("Selecciona un plan vinculado a un hallazgo.", 400);
  const finding = await requiredSource(user, "FINDING", action.sourceId);
  await assertWritableSourceScope(user, "FINDING", finding);
  const closed = finding.status !== "OPEN" || ["DONE", "CANCELLED"].includes(action.status);
  if (closed && !allowClosedReplay) {
    throw new ActionError("Este plan ya no admite cambios de avance.", 409);
  }
  if (action.assigneeId !== user.id && (assigneeOnly || !PLANNING_APPROVE_ROLES.includes(user.role))) {
    throw new ActionError("Solo el responsable puede modificar este plan.", 403);
  }
  return { action, finding, closed };
};

const evidenceOptions = async (user, finding) => {
  const linked = { RISK: finding.riskId, CONTROL: finding.controlId, AUDIT: finding.auditId };
  const rows = (await evidenceRepository.getAll()).filter((item) => linked[item.entityType] === item.entityId);
  const allowed = [];
  for (const row of rows) {
    if (await visibleSource(user, row.entityType, row.entityId)) {
      allowed.push({ id: row.id, title: row.title, entityType: row.entityType });
    }
  }
  return allowed;
};

const listPlanEvidence = async (user, id) => {
  const action = await getAction(user, id);
  if (action.sourceType !== "FINDING") throw new ActionError("Selecciona un plan vinculado a un hallazgo.", 400);
  const finding = await requiredSource(user, "FINDING", action.sourceId);
  return evidenceOptions(user, finding);
};

const replayPlanEvent = (action, user, operationId, version, type, note, progressPercent) => {
  if (!operationId) return null;
  if (typeof operationId !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId)) {
    throw new ActionError("La clave de operación debe ser un UUID válido.", 400);
  }
  const event = action?.history.find((entry) => entry.operationId === operationId);
  if (!event) return null;
  if (event.type !== type || String(event.actorId) !== String(user.id) ||
      event.baseVersion !== version || event.note !== note ||
      (type === "PROGRESS_UPDATED" && event.to !== progressPercent)) {
    throw new ActionError("La clave de operación ya se usó con otros datos.", 409);
  }
  return action;
};

const updateProgress = async (user, id, body, { operationId } = {}) => {
  const { action, finding, closed } = await editableFindingPlan(user, id,
    { allowClosedReplay: Boolean(operationId) });
  const progressPercent = body.progressPercent;
  const note = text(body.note);
  const evidenceId = text(body.evidenceId);
  const version = assertVersion(body.version);
  if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new ActionError("El avance debe ser un entero entre 0 y 100.", 400);
  }
  if (note.length < 10 || note.length > 1000) throw new ActionError("Explica el avance en 10 a 1,000 caracteres.", 400);
  const replay = replayPlanEvent(action, user, operationId, version, "PROGRESS_UPDATED", note, progressPercent);
  if (replay) {
    const event = replay.history.find((entry) => entry.operationId === operationId);
    if (text(event.evidenceId) !== evidenceId) throw new ActionError("La clave de operación ya se usó con otros datos.", 409);
    return replay;
  }
  if (closed) throw new ActionError("Este plan ya no admite cambios de avance.", 409);
  if (evidenceId && !(await evidenceOptions(user, finding)).some((item) => item.id === evidenceId)) {
    throw new ActionError("La evidencia no existe o no está disponible para este hallazgo.", 404);
  }
  const currentIds = action.evidenceIds || [];
  if (evidenceId && !currentIds.includes(evidenceId) && currentIds.length >= 20) {
    throw new ActionError("El plan admite hasta 20 evidencias vinculadas.", 400);
  }
  const now = new Date().toISOString();
  let updated;
  try { updated = await actionRepository.mutate(id, {
    progressPercent, evidenceIds: evidenceId ? [...new Set([...currentIds, evidenceId])] : currentIds,
    validationRequestedAt: progressPercent === 100 ? action.validationRequestedAt || null : null,
    history: [...action.history, { type: "PROGRESS_UPDATED", from: action.progressPercent ?? 0,
      to: progressPercent, note, ...(evidenceId ? { evidenceId } : {}),
      ...(operationId ? { operationId, baseVersion: version } : {}), ...actorEvent(user, now) }]
  }, version); }
  catch (error) {
    if (error.status !== 409 || !operationId) throw error;
    const current = await actionRepository.findById(id);
    const replayed = replayPlanEvent(current, user, operationId, version, "PROGRESS_UPDATED", note, progressPercent);
    if (!replayed) throw error;
    const event = replayed.history.find((entry) => entry.operationId === operationId);
    if (text(event.evidenceId) !== evidenceId) throw new ActionError("La clave de operación ya se usó con otros datos.", 409);
    return replayed;
  }
  await logActivity({ actor: user, action: "FINDING_PLAN_PROGRESS_UPDATED", details: {
    actionId: id, sourceId: action.sourceId, progressPercent, ...(evidenceId ? { evidenceId } : {})
  } });
  return updated;
};

const addPlanComment = async (user, id, body, { operationId } = {}) => {
  const { action, closed } = await editableFindingPlan(user, id,
    { allowClosedReplay: Boolean(operationId) });
  const note = text(body.note);
  const version = assertVersion(body.version);
  if (note.length < 2 || note.length > 1000) throw new ActionError("El comentario debe tener entre 2 y 1,000 caracteres.", 400);
  const replay = replayPlanEvent(action, user, operationId, version, "COMMENTED", note);
  if (replay) return replay;
  if (closed) throw new ActionError("Este plan ya no admite cambios de avance.", 409);
  const now = new Date().toISOString();
  let updated;
  try { updated = await actionRepository.mutate(id, { history: [...action.history,
    { type: "COMMENTED", note, ...(operationId ? { operationId, baseVersion: version } : {}),
      ...actorEvent(user, now) }] }, version); }
  catch (error) {
    if (error.status !== 409 || !operationId) throw error;
    const replayed = replayPlanEvent(await actionRepository.findById(id), user, operationId,
      version, "COMMENTED", note);
    if (!replayed) throw error;
    return replayed;
  }
  await logActivity({ actor: user, action: "FINDING_PLAN_COMMENTED", details: { actionId: id, sourceId: action.sourceId } });
  return updated;
};

const requestValidation = async (user, id, body) => {
  const { action } = await editableFindingPlan(user, id, { assigneeOnly: true });
  if (action.progressPercent !== 100) throw new ActionError("Completa el avance al 100 % antes de solicitar validación.", 409);
  if (action.validationRequestedAt) throw new ActionError("La validación ya fue solicitada.", 409);
  const note = text(body.note);
  if (note.length < 10 || note.length > 1000) throw new ActionError("Explica la solicitud en 10 a 1,000 caracteres.", 400);
  const now = new Date().toISOString();
  const updated = await actionRepository.mutate(id, { validationRequestedAt: now,
    history: [...action.history, { type: "VALIDATION_REQUESTED", note, ...actorEvent(user, now) }]
  }, assertVersion(body.version));
  await logActivity({ actor: user, action: "FINDING_PLAN_VALIDATION_REQUESTED", details: {
    actionId: id, sourceId: action.sourceId
  } });
  await notificationEvents.planValidationRequested(updated);
  return updated;
};

module.exports = { ActionError, listActions, visibleActionsFromGroups, listActionsForAudit, listSources, getAction, listAssignees,
  createAction, changeStatus, reassign, listPlanEvidence, updateProgress, addPlanComment,
  requestValidation, canTransition, dateIsValid };
