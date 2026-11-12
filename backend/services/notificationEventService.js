const userRepository = require("../repositories/userRepository");
const readRepository = require("../repositories/notificationReadRepository");
const pushService = require("./pushService");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { PLANNING_APPROVE_ROLES } = require("../config/roles");
const { assignmentId, validationId } = require("./notificationService");

// Delivery follows the committed domain mutation. A temporary inbox failure must
// not turn a successful write into an apparent failure; the inbox reconciles live
// events on its next read and records the missed delivery in server logs.
const deliver = async (recipients, sourceType, sourceId, notification) => {
  for (const id of new Set(recipients.filter((value) => Number.isSafeInteger(value)))) {
    try {
      const recipient = await userRepository.findById(id);
      if (recipient?.status !== "ACTIVE" || !await visibleRecordForUser(recipient, sourceType, sourceId)) continue;
      await readRepository.syncForUser(id, [notification]);
      try { await pushService.deliver(id, `${notification.id}:${notification.createdAt || ""}`); }
      catch (error) { console.error("[PUSH_DELIVERY_PENDING]", { recipientId: id, type: notification.type,
        reason: error.name }); }
    } catch (error) {
      console.error("[NOTIFICATION_DELIVERY_PENDING]", { type: notification.type, entityId: notification.entityId,
        recipientId: id, reason: error.message });
    }
  }
};

const proposalCreated = async (proposal) => {
  let people;
  try { people = await userRepository.getAll(); }
  catch (error) {
    console.error("[NOTIFICATION_DELIVERY_PENDING]", { type: "PROPOSAL_REVIEW", entityId: proposal.id,
      reason: error.message });
    return;
  }
  return deliver(people.filter((person) => PLANNING_APPROVE_ROLES.includes(person.role))
    .map((person) => person.id), "AUDIT", proposal.id, {
    id: `PROPOSAL_REVIEW:${proposal.id}`, type: "PROPOSAL_REVIEW",
    title: "Propuesta pendiente de decisión", description: `${proposal.title} · ${proposal.area}`,
    entityId: proposal.id, priority: proposal.risk === "Alto" ? "HIGH" : "MEDIUM",
    createdAt: proposal.createdAt, dueAt: null, path: "/planificacion"
  });
};

const proposalDecided = (proposal) => deliver([proposal.createdBy?.id], "AUDIT", proposal.id, {
  id: `PROPOSAL_DECIDED:${proposal.id}`, type: "PROPOSAL_DECIDED",
  title: proposal.status === "APPROVED" ? "Propuesta aprobada" : "Propuesta rechazada",
  description: `${proposal.title} · ${proposal.area}`, entityId: proposal.id, priority: "MEDIUM",
  createdAt: proposal.approvedAt || proposal.rejectedAt || proposal.updatedAt || proposal.createdAt,
  dueAt: null, path: "/planificacion"
});

const auditAssigned = (audit) => deliver([audit.responsibleId], "AUDIT", audit.id, {
  id: `AUDIT_FOLLOW_UP:${audit.id}`, type: "AUDIT_FOLLOW_UP", title: "Auditoría activa asignada",
  description: `${audit.title} · ${audit.area}`, entityId: audit.id, priority: "LOW",
  createdAt: audit.startedAt || audit.createdAt, dueAt: audit.endDate || null, path: "/auditorias-activas"
});

const actionAssigned = (action) => deliver([action.assigneeId], action.sourceType, action.sourceId, {
  id: assignmentId(action), type: "ACTION_ASSIGNED", title: "Nueva acción asignada",
  description: `${action.title} · ${action.sourceTitle}`, entityId: action.id, priority: "MEDIUM",
  createdAt: action.updatedAt || action.createdAt, dueAt: action.dueDate,
  path: `/notificaciones?actionId=${encodeURIComponent(action.id)}`
});

const planValidationRequested = async (action) => {
  let people;
  try { people = await userRepository.getAll(); }
  catch (error) {
    console.error("[NOTIFICATION_DELIVERY_PENDING]", { type: "PLAN_VALIDATION_REQUESTED",
      entityId: action.id, reason: error.message });
    return;
  }
  return deliver(people.filter((person) => PLANNING_APPROVE_ROLES.includes(person.role))
    .map((person) => person.id), "FINDING", action.sourceId, {
    id: validationId(action), type: "PLAN_VALIDATION_REQUESTED",
    title: "Plan listo para validar", description: `${action.title} · ${action.sourceTitle}`,
    entityId: action.id, priority: "HIGH", createdAt: action.validationRequestedAt,
    dueAt: null, path: `/notificaciones?actionId=${encodeURIComponent(action.id)}`
  });
};

const findingCreated = (finding, risk, control, audit) => deliver([
  finding.responsibleId, risk?.ownerId, control?.ownerId, audit?.responsibleId
],
  "FINDING", finding.id, {
    id: `FINDING_CREATED:${finding.id}`, type: "FINDING_CREATED", title: "Hallazgo registrado",
    description: finding.title, entityId: finding.id, priority: "HIGH",
    createdAt: finding.createdAt, dueAt: null,
    path: `/controles#finding-${encodeURIComponent(finding.id)}`
  });

const evidenceCreated = (evidence, entity) => {
  const recipient = evidence.entityType === "AUDIT" ? entity.responsibleId : entity.ownerId;
  return deliver([recipient], evidence.entityType, evidence.entityId, {
    id: `EVIDENCE_CREATED:${evidence.id}`, type: "EVIDENCE_CREATED",
    title: "Nueva evidencia vinculada", description: evidence.title, entityId: evidence.id,
    priority: "MEDIUM", createdAt: evidence.createdAt, dueAt: null,
    path: `/evidencias#evidence-${encodeURIComponent(evidence.id)}`
  });
};

module.exports = { proposalCreated, proposalDecided, auditAssigned, actionAssigned,
  planValidationRequested, findingCreated, evidenceCreated };
