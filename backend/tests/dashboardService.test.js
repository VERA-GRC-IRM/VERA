const test = require("node:test");
const assert = require("node:assert/strict");
const { getDashboardForUser } = require("../services/dashboardService");

const proposals = [
  { id: "OPEN-OWNED", title: "Mi propuesta", area: "Operaciones", status: "OPEN", responsibleId: 5, risk: "Alto", likelihood: 3, impact: 2, progress: 0, quarter: "Q2", year: 2026 },
  { id: "ACTIVE-OWNED", title: "Mi auditoría", area: "Finanzas", status: "ACTIVE", responsibleId: 5, risk: "Medio", likelihood: 2, impact: 3, progress: 40, quarter: "Q2", year: 2026 },
  { id: "CLOSED-OTHER", title: "Cerrada", area: "Tecnología", status: "CLOSED", responsibleId: 4, risk: "Alto", likelihood: 3, impact: 3, progress: 100, quarter: "Q1", year: 2026 },
  { id: "OPEN-OTHER", title: "Otra propuesta", area: "Legal", status: "OPEN", responsibleId: null, risk: "Bajo", likelihood: 1, impact: 1, progress: 0, quarter: "Q3", year: 2026 }
];

test("dashboard metrics and matrix match visible proposal state", () => {
  const dashboard = getDashboardForUser({ id: 2, role: "DIRECTOR" }, proposals);
  assert.deepEqual(dashboard.metrics, {
    total: 4,
    pending: 2,
    active: 1,
    openFindings: 0,
    highRisk: 2,
    averageProgress: 70
  });
  assert.equal(dashboard.statusCounts.find(({ status }) => status === "CLOSED").count, 1);
  assert.equal(dashboard.riskMatrix.length, 3);
  assert.equal(dashboard.riskMatrix[1][2].risk, "Alto");
  assert.equal(dashboard.riskMatrix[1][2].count, 1);
  assert.equal(dashboard.riskMatrix.flat().reduce((total, cell) => total + cell.count, 0), 1);
  assert.equal(dashboard.permissions.canApprove, false);
});

test("auditor dashboard metrics and pending items exclude unassigned records", () => {
  const dashboard = getDashboardForUser({ id: 5, role: "AUDITOR" }, proposals);
  assert.equal(dashboard.scopeLabel, "Solo mis asignaciones");
  assert.equal(dashboard.metrics.total, 2);
  assert.equal(dashboard.metrics.pending, 1);
  assert.equal(dashboard.metrics.active, 1);
  assert.equal(dashboard.metrics.highRisk, 1);
  assert.equal(dashboard.metrics.averageProgress, 40);
  assert.deepEqual(dashboard.pendingItems.map(({ id }) => id).sort(), ["ACTIVE-OWNED", "OPEN-OWNED"]);
  assert.equal(dashboard.permissions.canCreate, false);
  assert.equal(dashboard.permissions.canApprove, false);
  assert.ok(dashboard.riskMatrix.flat().every((cell) => cell.count === 0 || (cell.likelihood === 2 && cell.impact === 3)));
});

test("roles receive distinct copy and quick-action permissions", () => {
  const director = getDashboardForUser({ id: 2, role: "DIRECTOR" }, []);
  const manager = getDashboardForUser({ id: 3, role: "GERENTE" }, []);
  const jefatura = getDashboardForUser({ id: 4, role: "JEFATURA" }, []);
  const auditor = getDashboardForUser({ id: 5, role: "AUDITOR" }, []);

  assert.notEqual(director.title, manager.title);
  assert.equal(director.permissions.canApprove, false);
  assert.equal(manager.permissions.canCreate, true);
  assert.equal(manager.permissions.canApprove, true);
  assert.equal(jefatura.permissions.canCreate, true);
  assert.equal(jefatura.permissions.canApprove, false);
  assert.equal(jefatura.permissions.canManageExecution, false);
  assert.equal(auditor.permissions.canManageExecution, false);
});

test("jefatura sees only its own open proposals as pending actions", () => {
  const dashboard = getDashboardForUser({ id: 4, role: "JEFATURA" }, [
    { ...proposals[0], createdBy: { id: 4, name: "Jefatura" } },
    { ...proposals[3], createdBy: { id: 3, name: "Gerencia" } }
  ]);
  assert.deepEqual(dashboard.pendingItems.map(({ id }) => id), ["OPEN-OWNED"]);
  assert.equal(dashboard.metrics.total, 2);
});

test("HU-07: hallazgos abiertos y pendientes de revisión se cuentan dentro de hallazgos visibles", () => {
  const findings = [
    { id: "FDG-1", auditId: "ACTIVE-OWNED", status: "OPEN" },
    { id: "FDG-2", auditId: "CLOSED-OTHER", status: "OPEN" },
    { id: "FDG-3", auditId: "ACTIVE-OWNED", status: "CLOSED" },
    { id: "FDG-4", auditId: null, status: "OPEN" },
    { id: "FDG-5", auditId: "ACTIVE-OWNED", status: "PENDING_CLOSURE" }
  ];
  assert.equal(getDashboardForUser({ id: 5, role: "AUDITOR" }, proposals,
    [findings[0], findings[3], findings[4]]).metrics.openFindings, 3);
  assert.equal(getDashboardForUser({ id: 2, role: "DIRECTOR" }, proposals,
    [findings[0], findings[1], findings[3], findings[4]]).metrics.openFindings, 4);
});
