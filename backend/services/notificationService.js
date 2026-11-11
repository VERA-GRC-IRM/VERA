const { ROLES, PLANNING_APPROVE_ROLES } = require("../config/roles");

const isWithinDays = (date, now, days) => {
  if (!date) return false;
  const due = Date.parse(`${date}T23:59:59.999Z`);
  return Number.isFinite(due) && due >= now && due - now <= days * 24 * 60 * 60 * 1000;
};

const buildNotifications = ({ proposals, actions = [], risks = [], controls = [], findings = [], evidence = [],
  user, now = Date.now(), offsetMinutes = 0 }) => {
  const notifications = [];
  const isApprover = PLANNING_APPROVE_ROLES.includes(user.role);
  const canStart = isApprover;

  for (const proposal of proposals) {
    if (proposal.status === "OPEN" && isApprover) {
      notifications.push({
        id: `PROPOSAL_REVIEW:${proposal.id}`,
        type: "PROPOSAL_REVIEW",
        title: "Propuesta pendiente de decisión",
        description: `${proposal.title} · ${proposal.area}`,
        entityId: proposal.id,
        priority: proposal.risk === "Alto" ? "HIGH" : "MEDIUM",
        createdAt: proposal.createdAt,
        dueAt: null,
        path: "/planificacion"
      });
    }

    if (proposal.status === "OPEN" && [ROLES.GERENTE, ROLES.JEFATURA].includes(user.role) && proposal.createdBy?.id === user.id) {
      notifications.push({
        id: `PROPOSAL_TRACK:${proposal.id}`,
        type: "PROPOSAL_TRACK",
        title: "Propuesta esperando revisión",
        description: `${proposal.title} · ${proposal.area}`,
        entityId: proposal.id,
        priority: "LOW",
        createdAt: proposal.createdAt,
        dueAt: null,
        path: "/planificacion"
      });
    }

    if (["APPROVED", "REJECTED"].includes(proposal.status) && proposal.createdBy?.id === user.id) {
      notifications.push({
        id: `PROPOSAL_DECIDED:${proposal.id}`, type: "PROPOSAL_DECIDED",
        title: proposal.status === "APPROVED" ? "Propuesta aprobada" : "Propuesta rechazada",
        description: `${proposal.title} · ${proposal.area}`, entityId: proposal.id,
        priority: "MEDIUM", createdAt: proposal.approvedAt || proposal.rejectedAt || proposal.updatedAt || proposal.createdAt,
        dueAt: null, path: "/planificacion"
      });
    }

    if (proposal.status === "APPROVED" && canStart) {
      notifications.push({
        id: `AUDIT_START:${proposal.id}`,
        type: "AUDIT_START",
        title: "Auditoría aprobada lista para iniciar",
        description: `${proposal.title} · ${proposal.quarter || "Trimestre por definir"} ${proposal.year}`,
        entityId: proposal.id,
        priority: "MEDIUM",
        createdAt: proposal.approvedAt || proposal.createdAt,
        dueAt: proposal.startDate || null,
        path: "/auditorias-activas"
      });
    }

    if (proposal.status === "ACTIVE" && proposal.responsibleId === user.id) {
      const overdue = proposal.endDate && Date.parse(`${proposal.endDate}T23:59:59.999Z`) < now;
      const dueSoon = isWithinDays(proposal.endDate, now, 7);
      notifications.push({
        id: `AUDIT_FOLLOW_UP:${proposal.id}`,
        type: "AUDIT_FOLLOW_UP",
        title: overdue ? "Auditoría con fecha de cierre vencida" : dueSoon ? "Auditoría próxima a su fecha de cierre" : "Auditoría activa asignada",
        description: `${proposal.title} · ${proposal.area}`,
        entityId: proposal.id,
        priority: overdue ? "HIGH" : dueSoon ? "MEDIUM" : "LOW",
        createdAt: proposal.startedAt || proposal.createdAt,
        dueAt: proposal.endDate || null,
        path: "/auditorias-activas"
      });
    }
  }

  const localDay = new Date(now - offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
  const cutoffDay = new Date(Date.parse(`${localDay}T00:00:00.000Z`) + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const action of actions) {
    if (action.sourceType === "FINDING" && action.validationRequestedAt &&
        ["OPEN", "IN_PROGRESS"].includes(action.status) && isApprover) {
      notifications.push({
        id: `PLAN_VALIDATION_REQUESTED:${action.id}`, type: "PLAN_VALIDATION_REQUESTED",
        title: "Plan listo para validar", description: `${action.title} · ${action.sourceTitle}`,
        entityId: action.id, priority: "HIGH", createdAt: action.validationRequestedAt,
        dueAt: null, path: `/notificaciones?actionId=${encodeURIComponent(action.id)}`
      });
    }
    if (action.assigneeId === user.id && action.createdBy?.id !== undefined &&
        action.createdBy.id !== user.id && ["OPEN", "IN_PROGRESS"].includes(action.status)) {
      notifications.push({
        id: `ACTION_ASSIGNED:${action.id}`, type: "ACTION_ASSIGNED", title: "Nueva acción asignada",
        description: `${action.title} · ${action.sourceTitle}`, entityId: action.id,
        priority: "MEDIUM", createdAt: action.createdAt, dueAt: action.dueDate,
        path: `/notificaciones?actionId=${encodeURIComponent(action.id)}`
      });
    }
    if (action.assigneeId !== user.id || !["OPEN", "IN_PROGRESS"].includes(action.status) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate || "")) continue;
    const overdue = action.dueDate < localDay;
    if (!overdue && action.dueDate > cutoffDay) continue;
    const type = overdue ? "ACTION_OVERDUE" : "ACTION_DUE_SOON";
    notifications.push({
      id: `${type}:${action.id}`,
      type,
      title: overdue ? "Compromiso con fecha vencida" : "Compromiso próximo a vencer",
      description: `${action.title} · ${action.sourceTitle}`,
      entityId: action.id,
      priority: overdue ? "HIGH" : "MEDIUM",
      createdAt: action.updatedAt || action.createdAt,
      dueAt: action.dueDate,
      path: `/notificaciones?actionId=${encodeURIComponent(action.id)}`
    });
  }

  const riskById = new Map(risks.map((risk) => [risk.id, risk]));
  const controlById = new Map(controls.map((control) => [control.id, control]));
  const auditById = new Map(proposals.map((audit) => [audit.id, audit]));
  for (const finding of findings) {
    const recipients = [riskById.get(finding.riskId)?.ownerId,
      controlById.get(finding.controlId)?.ownerId];
    if (!recipients.includes(user.id) || finding.createdBy?.id === user.id) continue;
    notifications.push({
      id: `FINDING_CREATED:${finding.id}`, type: "FINDING_CREATED", title: "Hallazgo registrado",
      description: finding.title, entityId: finding.id, priority: "HIGH",
      createdAt: finding.createdAt, dueAt: null,
      path: `/controles#finding-${encodeURIComponent(finding.id)}`
    });
  }
  for (const item of evidence) {
    const source = item.entityType === "AUDIT" ? auditById.get(item.entityId)
      : item.entityType === "RISK" ? riskById.get(item.entityId)
        : controlById.get(item.entityId);
    const recipientId = item.entityType === "AUDIT" ? source?.responsibleId : source?.ownerId;
    if (recipientId !== user.id || item.author?.id === user.id) continue;
    notifications.push({
      id: `EVIDENCE_CREATED:${item.id}`, type: "EVIDENCE_CREATED", title: "Nueva evidencia vinculada",
      description: item.title, entityId: item.id, priority: "MEDIUM",
      createdAt: item.createdAt, dueAt: null,
      path: `/evidencias#evidence-${encodeURIComponent(item.id)}`
    });
  }

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
};

module.exports = { buildNotifications };
