const { listActions, listSources, listAssignees, getAction, changeStatus, reassign, canTransition, dateIsValid } = require("./actionService");
const userRepository = require("../repositories/userRepository");
const { RECORD_CREATE_ROLES, PLANNING_APPROVE_ROLES } = require("../config/roles");
const { randomUUID } = require("node:crypto");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });

const parseCompletion = (question) => {
  const prefix = "(?:completa|completar|finaliza|finalizar|marca|marcar|cierra|cerrar)\\s+(?:el\\s+)?compromiso\\s+";
  const quoted = new RegExp(`^${prefix}[\"“«](.+?)[\"”»]\\s+(?:como\\s+(?:completado|terminado)\\s+)?(?:porque|motivo\\s*:)\\s+(.+)$`, "i");
  const plain = new RegExp(`^${prefix}(.+?)\\s+(?:como\\s+(?:completado|terminado)\\s+)?(?:porque|motivo\\s*:)\\s+(.+)$`, "i");
  const match = question.match(quoted) || question.match(plain);
  return match ? { target: match[1].trim(), note: match[2].trim() } : null;
};

const STATUS_COMMANDS = [
  { status: "DONE", label: "completar", result: "completado" },
  { status: "IN_PROGRESS", verbs: "inicia|iniciar|empieza|empezar", label: "poner en curso", result: "en curso" },
  { status: "OPEN", verbs: "reabre|reabrir", label: "reabrir", result: "reabierto" },
  { status: "CANCELLED", verbs: "cancela|cancelar", label: "cancelar", result: "cancelado" }
];
const parseStatusChange = (question) => {
  const complete = parseCompletion(question);
  if (complete) return { ...complete, status: "DONE" };
  for (const item of STATUS_COMMANDS.slice(1)) {
    const prefix = "^(?:" + item.verbs + ")\\s+(?:el\\s+)?compromiso\\s+";
    const tail = "\\s+(?:porque|motivo\\s*:)\\s+(.+)$";
    const quoted = new RegExp(prefix + '["“«](.+?)["”»]' + tail, "i");
    const plain = new RegExp(prefix + "(.+?)" + tail, "i");
    const match = question.match(quoted) || question.match(plain);
    if (match) return { target: match[1].trim(), note: match[2].trim(), status: item.status };
  }
  return null;
};
const statusDescription = (status) => STATUS_COMMANDS.find((item) => item.status === status);

const parseReassignment = (question) => {
  const quoted = /^(?:reasigna|reasignar)\s+(?:el\s+)?compromiso\s+["“«](.+?)["”»]\s+a\s+["“«](.+?)["”»]\s+(?:porque|motivo\s*:)\s+(.+)$/i;
  const plain = /^(?:reasigna|reasignar)\s+(?:el\s+)?compromiso\s+(ACT-[0-9a-f-]{36})\s+a\s+(.+?)\s+(?:porque|motivo\s*:)\s+(.+)$/i;
  const match = question.match(quoted) || question.match(plain);
  return match ? { target: match[1].trim(), assignee: match[2].trim(), note: match[3].trim() } : null;
};
const parseAssigneeList = (question) => {
  const match = question.match(/^(?:lista|mue[eé]strame|dame)\s+(?:los\s+)?responsables\s+(?:para|del)\s+(?:el\s+)?compromiso\s+(.+)$/i);
  return match ? match[1].trim().replace(/^[“"«]|[”"»]$/g, "") : null;
};

const SOURCE_NAMES = { auditoria: "AUDIT", riesgo: "RISK", control: "CONTROL", hallazgo: "FINDING" };
const parseCreation = (question) => {
  const match = question.match(/^(?:crea|crear|registra|registrar)\s+(?:un\s+)?compromiso\s+["“«](.+?)["”»]\s+para\s+(?:la|el)\s+(auditoría|auditoria|riesgo|control|hallazgo)\s+["“«](.+?)["”»]\s+porque\s+(.+?)\s+(?:con\s+)?vencimiento\s+(\d{4}-\d{2}-\d{2})\.?$/i);
  return match ? { title: match[1].trim(), sourceType: SOURCE_NAMES[normalize(match[2])],
    source: match[3].trim(), rationale: match[4].trim(), dueDate: match[5] } : null;
};
const creationIntent = (question) => /^(?:crea|crear|registra|registrar)\s+(?:un\s+)?compromiso\b/i.test(question);

const confirm = (question) => /^(confirmar cambio|confirmo el cambio)$/i.test(question.trim());
const listRequest = (question) => /^(?:muestrame|lista|dame|ver)\s+(?:mis|los|todos los)\s+compromisos(?:\s+(?:abiertos|pendientes|cerrados|completados|cancelados))?$/
  .test(normalize(question));
const nextRequest = (question, thread) => /^(siguientes compromisos|mas compromisos)$/.test(normalize(question)) &&
  thread.messages.at(-1)?.browse?.type === "action-commitments" &&
  thread.messages.at(-1)?.browse?.hasMore === true;

const listCommitments = async (user, question, thread) => {
  const previous = thread.messages.at(-1)?.browse;
  const isNext = nextRequest(question, thread);
  const offset = isNext ? Math.min(previous.offset + 10, 1000) : 0;
  const mine = isNext ? previous.mine : /\bmis\b/.test(normalize(question));
  const filter = isNext ? previous.filter || "OPEN" : /\bcerrados\b/.test(normalize(question)) ? "CLOSED"
    : /\bcompletados\b/.test(normalize(question)) ? "DONE"
    : /\bcancelados\b/.test(normalize(question)) ? "CANCELLED" : "OPEN";
  const visible = (await listActions(user)).filter((item) =>
    (filter === "OPEN" ? ["OPEN", "IN_PROGRESS"].includes(item.status)
      : filter === "CLOSED" ? ["DONE", "CANCELLED"].includes(item.status) : item.status === filter) &&
    (!mine || item.assigneeId === user.id));
  const rows = visible.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) ||
    String(a.id).localeCompare(String(b.id)));
  const items = rows.slice(offset, offset + 10).map((item) => ({ sourceId: `action:${item.id}`,
    type: "Compromiso", id: item.id, title: item.title,
    path: `/notificaciones?actionId=${encodeURIComponent(item.id)}`,
    facts: [{ label: "Identificador", value: item.id }, { label: "Estado", value: item.status },
      { label: "Origen", value: item.sourceTitle },
      { label: "Responsable", value: item.assigneeName }, { label: "Vence", value: item.dueDate }] }));
  const hasMore = offset + items.length < rows.length;
  return response(rows.length
    ? `Hay ${rows.length} compromisos ${filter === "OPEN" ? "abiertos" : filter === "DONE" ? "completados" : filter === "CLOSED" ? "cerrados" : "cancelados"} ${mine ? "asignados a ti" : "visibles para tu cuenta"}. Muestro ${offset + 1}–${offset + items.length}.${hasMore ? " Escribe «siguientes compromisos» para continuar." : ""} Puedes pedir un cambio de estado por título o identificador y explicar el motivo.`
    : "No encontré compromisos con ese estado en tu alcance.", "browse",
  { browse: { type: "action-commitments", offset, mine, filter, total: rows.length, hasMore, items } });
};

const handleAssistantAction = async (user, question, thread) => {
  const command = parseStatusChange(question);
  const creation = parseCreation(question);
  const reassignment = parseReassignment(question);
  const assigneeTarget = parseAssigneeList(question);
  const listing = listRequest(question) || nextRequest(question, thread);
  const reservation = thread.messages.at(-1)?.actionReservation;
  if (!command && !creationIntent(question) && !reassignment && !assigneeTarget && !confirm(question) && !listing && !reservation) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (reservation && !confirm(question)) {
    return response("Hay una confirmación en curso. Espera unos segundos y escribe «Confirmar cambio» para comprobar su resultado.", "action-pending");
  }
  if (listing) return listCommitments(user, question, thread);
  if (assigneeTarget) {
    const matches = (await listActions(user)).filter((action) =>
      normalize(action.title) === normalize(assigneeTarget) || normalize(action.id) === normalize(assigneeTarget));
    if (matches.length !== 1) return response("Indica un título único o el identificador exacto del compromiso para consultar responsables.");
    const people = await listAssignees(user, matches[0].sourceType, matches[0].sourceId);
    return response(people.length
      ? `Responsables activos que pueden consultar este origen: ${people.slice(0, 12).map((person) => `${person.name} (ID ${person.id}, ${person.role})`).join("; ")}.`
      : "No encontré responsables activos con acceso a este origen.");
  }
  if (!RECORD_CREATE_ROLES.includes(user.role)) {
    return response("Tu rol no puede actualizar compromisos. Puedes consultarlos desde esta conversación.");
  }

  if (confirm(question)) {
    if (reservation?.type === "ACTION_CREATE") {
      const existing = (await listActions(user)).find((item) => item.aiOperationId === reservation.operationId &&
        item.createdBy?.id === user.id);
      return existing
        ? response(`El compromiso «${existing.title}» ya quedó creado con identificador ${existing.id}. Puedes consultarlo en tus compromisos.`,
          "action-executed", { actionOutcome: { id: existing.id, status: existing.status } })
        : Date.now() - Date.parse(reservation.createdAt) < 120_000
          ? response("La confirmación sigue en curso. Espera unos segundos y vuelve a consultar el resultado.", "action-pending")
          : response("La confirmación quedó reservada, pero no hay constancia de que se haya creado el compromiso. Solicita una vista previa nueva antes de intentarlo otra vez.");
    }
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || !["ACTION_STATUS_CHANGE", "ACTION_REASSIGN", "ACTION_CREATE"].includes(draft.type)) {
      return response("No hay un cambio pendiente de confirmación. Primero indica qué compromiso deseas actualizar y por qué.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) {
      return response("La confirmación venció. Vuelve a pedir el cambio para revisar el estado actual.");
    }
    if (draft.type === "ACTION_CREATE") {
      if (!RECORD_CREATE_ROLES.includes(user.role)) return response("Tu rol no puede crear compromisos.");
      const source = (await listSources(user)).find((item) =>
        item.sourceType === draft.sourceType && item.sourceId === draft.sourceId);
      if (!source) return response("El registro de origen ya no está disponible para tu cuenta. Solicita una vista previa nueva.");
      return response("Confirmación recibida. Estoy registrando el compromiso.", "action-reservation",
        { actionCreate: draft });
    }
    const action = await getAction(user, draft.id);
    if (draft.type === "ACTION_REASSIGN") {
      if (!PLANNING_APPROVE_ROLES.includes(user.role)) {
        return response("Tu rol no puede reasignar compromisos.");
      }
      if (action.storageVersion !== draft.version || action.assigneeId === draft.assigneeId) {
        return response("El responsable o la versión del compromiso cambiaron. Pide la reasignación otra vez.");
      }
      const updated = await reassign(user, draft.id,
        { assigneeId: draft.assigneeId, note: draft.note, version: draft.version });
      return response(`Quedó reasignado «${updated.title}» a ${updated.assigneeName}. La decisión se registró en la bitácora.`,
        "action-executed", { actionOutcome: { id: updated.id, assigneeId: updated.assigneeId } });
    }
    if (action.storageVersion !== draft.version || !canTransition(action.status, draft.status)) {
      return response(action.status === draft.status
        ? "El compromiso ya figura con el estado solicitado. Revisa su bitácora para confirmar quién y cuándo registró el cambio."
        : "El compromiso cambió desde la vista previa. Pide el cambio otra vez para revisar su estado actual.");
    }
    const updated = await changeStatus(user, draft.id,
      { status: draft.status, note: draft.note, version: draft.version });
    return response(`Quedó ${statusDescription(draft.status).result} el compromiso «${updated.title}». El cambio y su motivo se registraron en la bitácora.`,
      "action-executed", { actionOutcome: { id: updated.id, status: updated.status } });
  }

  if (creation) {
    if (creation.title.length < 3 || creation.title.length > 140 ||
        creation.rationale.length < 10 || creation.rationale.length > 1000 ||
        !dateIsValid(creation.dueDate)) {
      return response("Indica un título de 3 a 140 caracteres, un motivo de 10 a 1,000 y una fecha válida AAAA-MM-DD.");
    }
    const matches = (await listSources(user)).filter((item) => item.sourceType === creation.sourceType &&
      (normalize(item.title) === normalize(creation.source) || normalize(item.sourceId) === normalize(creation.source)));
    if (matches.length !== 1) {
      return response(matches.length > 1
        ? "Hay varios registros de origen con ese título. Repite la instrucción con el identificador exacto."
        : "No encontré ese registro de origen en tu alcance. Comprueba el título o identificador exacto.");
    }
    const source = matches[0];
    const draft = { type: "ACTION_CREATE", operationId: randomUUID(), sourceType: source.sourceType,
      sourceId: source.sourceId, title: creation.title, rationale: creation.rationale,
      dueDate: creation.dueDate, assigneeId: user.id,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    return response(`Revisa antes de crear: «${creation.title}» para ${source.title}, a tu cargo, con vencimiento ${creation.dueDate}. Motivo: ${creation.rationale}. Escribe «Confirmar cambio» en los próximos cinco minutos para registrarlo.`,
      "action-preview", { actionDraft: draft });
  }
  if (creationIntent(question)) {
    return response("Para crear un compromiso, indica título, origen, motivo y vencimiento. Ejemplo: Crea un compromiso «Revisar evidencia» para el riesgo «Proveedor crítico» porque falta comprobar el control con vencimiento 2026-12-01.");
  }

  if (reassignment) {
    if (!PLANNING_APPROVE_ROLES.includes(user.role)) return response("Tu rol no puede reasignar compromisos.");
    if (reassignment.target.length > 140 || reassignment.assignee.length > 120 ||
        reassignment.note.length < 10 || reassignment.note.length > 1000) {
      return response("Indica un compromiso, un responsable exacto y un motivo de 10 a 1,000 caracteres.");
    }
    const matches = (await listActions(user)).filter((action) =>
      normalize(action.title) === normalize(reassignment.target) ||
      normalize(action.id) === normalize(reassignment.target));
    if (matches.length !== 1) {
      return response("No hay un compromiso único con ese título. Pide la lista y repite la instrucción con su identificador.");
    }
    const action = matches[0];
    const candidates = (await listAssignees(user, action.sourceType, action.sourceId)).filter((person) =>
      normalize(person.name) === normalize(reassignment.assignee) ||
      String(person.id) === reassignment.assignee);
    if (candidates.length !== 1 || candidates[0].id === action.assigneeId) {
      return response("El nuevo responsable no es único, no tiene acceso al origen o ya es el responsable actual. Consulta los responsables válidos en el chat.");
    }
    const assignee = candidates[0];
    const draft = { type: "ACTION_REASSIGN", id: action.id, assigneeId: assignee.id,
      version: action.storageVersion, note: reassignment.note,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    return response(`Revisa antes de ejecutar: reasignar «${action.title}» de ${action.assigneeName} a ${assignee.name}. Motivo: ${reassignment.note}. Escribe «Confirmar cambio» en los próximos cinco minutos para registrarlo.`,
      "action-preview", { actionDraft: draft });
  }

  if (command.target.length > 140 || command.note.length < 10 || command.note.length > 1000) {
    return response("Escribe el título o identificador del compromiso y un motivo de 10 a 1,000 caracteres. Por ejemplo: Completa el compromiso «Revisar evidencia» porque la revisión quedó documentada.");
  }
  const actions = await listActions(user);
  const matches = actions.filter((action) => canTransition(action.status, command.status) &&
    (normalize(action.title) === normalize(command.target) || normalize(action.id) === normalize(command.target)));
  if (matches.length === 0) {
    return response("No encontré un compromiso con ese título o identificador y una transición válida en tu alcance. Consulta tus compromisos en el chat y copia su título exacto.");
  }
  if (matches.length > 1) {
    const options = matches.slice(0, 5).map((item) => `${item.id} · ${item.sourceTitle}`).join("; ");
    return response(`Hay varios compromisos con ese título. Repite la instrucción con uno de estos identificadores: ${options}.`);
  }
  const action = matches[0];
  if (action.assigneeId !== user.id && !PLANNING_APPROVE_ROLES.includes(user.role)) {
    return response("Puedes consultar ese compromiso, pero tu rol no puede cambiar su estado.");
  }
  const draft = { type: "ACTION_STATUS_CHANGE", id: action.id, status: command.status, version: action.storageVersion,
    note: command.note, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de ejecutar: ${statusDescription(command.status).label} «${action.title}» (${action.sourceTitle}). Motivo: ${command.note}. Escribe «Confirmar cambio» en los próximos cinco minutos para registrarlo; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { handleAssistantAction, parseCompletion, parseStatusChange, parseReassignment, parseCreation,
  isCommitmentList: (question) => Boolean(listRequest(question) || parseAssigneeList(question)),
  isActionCommand: (question) =>
  Boolean(parseStatusChange(question) || parseReassignment(question) || creationIntent(question) ||
    confirm(question) || listRequest(question) || parseAssigneeList(question)) };
