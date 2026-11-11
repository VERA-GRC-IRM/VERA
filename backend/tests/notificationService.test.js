const test = require("node:test");
const assert = require("node:assert/strict");
const { buildNotifications } = require("../services/notificationService");

const now = Date.parse("2026-10-09T12:00:00.000Z");

test("notification service ranks high before medium and low items deterministically", () => {
  const proposals = [
    { id: "AUD-HIGH", status: "OPEN", title: "Riesgo alto", area: "A", risk: "Alto", createdAt: "2026-10-08T12:00:00.000Z" },
    { id: "AUD-MED", status: "OPEN", title: "Riesgo medio", area: "B", risk: "Medio", createdAt: "2026-10-09T11:00:00.000Z" },
    { id: "AUD-APPROVED", status: "APPROVED", title: "Lista", area: "C", risk: "Bajo", quarter: "Q4", year: 2026, createdAt: "2026-10-08T10:00:00.000Z" }
  ];

  const notifications = buildNotifications({ proposals, user: { id: 3, role: "GERENTE" }, now });
  assert.deepEqual(notifications.map(({ priority }) => priority), ["HIGH", "MEDIUM", "MEDIUM"]);
  assert.equal(notifications[0].id, "PROPOSAL_REVIEW:AUD-HIGH");
  assert.equal(notifications[1].id, "PROPOSAL_REVIEW:AUD-MED");
  assert.equal(notifications[2].type, "AUDIT_START");
  assert.equal(notifications[2].path, "/auditorias-activas");
});

test("auditor notifications are scoped to assignments and classify overdue/due-soon dates", () => {
  const proposals = [
    { id: "AUD-OVERDUE", status: "ACTIVE", responsibleId: 5, title: "Vencida", area: "A", endDate: "2026-10-08", createdAt: "2026-10-01T00:00:00.000Z" },
    { id: "AUD-SOON", status: "ACTIVE", responsibleId: 5, title: "Próxima", area: "B", endDate: "2026-10-15", createdAt: "2026-10-02T00:00:00.000Z" },
    { id: "AUD-LATER", status: "ACTIVE", responsibleId: 5, title: "Posterior", area: "C", endDate: "2026-10-30", createdAt: "2026-10-03T00:00:00.000Z" },
    { id: "AUD-OTHER", status: "ACTIVE", responsibleId: 4, title: "Otra asignación", area: "D", endDate: "2026-10-08", createdAt: "2026-10-04T00:00:00.000Z" }
  ];

  const notifications = buildNotifications({ proposals, user: { id: 5, role: "AUDITOR" }, now });
  assert.deepEqual(notifications.map(({ id, priority }) => [id, priority]), [
    ["AUDIT_FOLLOW_UP:AUD-OVERDUE", "HIGH"],
    ["AUDIT_FOLLOW_UP:AUD-SOON", "MEDIUM"],
    ["AUDIT_FOLLOW_UP:AUD-LATER", "LOW"]
  ]);
});

test("action reminders follow the assigned user's local calendar and active state", () => {
  const actions = [
    { id: "ACT-LATE", assigneeId: 5, status: "OPEN", dueDate: "2026-10-07", title: "Vencida", sourceTitle: "Auditoría", createdAt: "2026-10-01T00:00:00Z" },
    { id: "ACT-TODAY", assigneeId: 5, status: "IN_PROGRESS", dueDate: "2026-10-08", title: "Hoy", sourceTitle: "Riesgo", createdAt: "2026-10-02T00:00:00Z" },
    { id: "ACT-SEVEN", assigneeId: 5, status: "OPEN", dueDate: "2026-10-15", title: "Siete días", sourceTitle: "Control", createdAt: "2026-10-03T00:00:00Z" },
    { id: "ACT-LATER", assigneeId: 5, status: "OPEN", dueDate: "2026-10-16", title: "Después", sourceTitle: "Control" },
    { id: "ACT-DONE", assigneeId: 5, status: "DONE", dueDate: "2026-10-07", title: "Cerrada", sourceTitle: "Control" },
    { id: "ACT-OTHER", assigneeId: 6, status: "OPEN", dueDate: "2026-10-07", title: "Ajena", sourceTitle: "Control" }
  ];
  const notifications = buildNotifications({ proposals: [], actions, user: { id: 5, role: "AUDITOR" },
    now: Date.parse("2026-10-09T01:00:00Z"), offsetMinutes: 360 });
  assert.deepEqual(notifications.map(({ id, priority }) => [id, priority]), [
    ["ACTION_OVERDUE:ACT-LATE", "HIGH"],
    ["ACTION_DUE_SOON:ACT-SEVEN", "MEDIUM"],
    ["ACTION_DUE_SOON:ACT-TODAY", "MEDIUM"]
  ]);
  assert.equal(notifications[0].path, "/notificaciones?actionId=ACT-LATE");
  assert.equal(notifications[0].dueAt, "2026-10-07");
  const nextDay = buildNotifications({ proposals: [], actions, user: { id: 5, role: "AUDITOR" },
    now: Date.parse("2026-10-09T06:00:00Z"), offsetMinutes: 360 });
  assert.ok(nextDay.some(({ id }) => id === "ACTION_OVERDUE:ACT-TODAY"));
  assert.ok(!nextDay.some(({ id }) => id === "ACTION_DUE_SOON:ACT-TODAY"));
});

test("HU-17: assignments, decisions, findings and evidence target only their owner", () => {
  const proposals = [{ id: "AUD-X", status: "APPROVED", title: "Revisión", area: "Operaciones",
    createdBy: { id: 4 }, approvedAt: "2026-10-09T10:00:00Z" }];
  const actions = [{ id: "ACT-X", title: "Corregir", sourceTitle: "Riesgo", assigneeId: 5,
    createdBy: { id: 3 }, status: "OPEN", dueDate: "2026-12-31", createdAt: "2026-10-09T09:00:00Z" }];
  const risks = [{ id: "RSK-X", ownerId: 5 }];
  const controls = [{ id: "CTL-X", ownerId: 3 }];
  const findings = [{ id: "FDG-X", riskId: "RSK-X", controlId: "CTL-X", title: "Excepción",
    createdBy: { id: 3 }, createdAt: "2026-10-09T08:00:00Z" }];
  const evidence = [{ id: "EVD-X", entityType: "RISK", entityId: "RSK-X", title: "Acta",
    author: { id: 3 }, createdAt: "2026-10-09T07:00:00Z" }];
  const data = { proposals, actions, risks, controls, findings, evidence, now };
  const owner = buildNotifications({ ...data, user: { id: 5, role: "AUDITOR" } });
  assert.ok(owner.some((item) => item.id === "ACTION_ASSIGNED:ACT-X"));
  assert.ok(owner.some((item) => item.id === "FINDING_CREATED:FDG-X" && item.path === "/controles#finding-FDG-X"));
  assert.ok(owner.some((item) => item.id === "EVIDENCE_CREATED:EVD-X" && item.path === "/evidencias#evidence-EVD-X"));
  const creator = buildNotifications({ ...data, user: { id: 4, role: "JEFATURA" } });
  assert.ok(creator.some((item) => item.id === "PROPOSAL_DECIDED:AUD-X"));
  assert.ok(!creator.some((item) => item.id === "EVIDENCE_CREATED:EVD-X"));
  const unrelated = buildNotifications({ ...data, user: { id: 2, role: "DIRECTOR" } });
  assert.ok(!unrelated.some((item) => ["ACTION_ASSIGNED", "FINDING_CREATED", "EVIDENCE_CREATED", "PROPOSAL_DECIDED"].includes(item.type)));
});
