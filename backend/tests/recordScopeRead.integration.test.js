const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "record-scope-read-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { createOrgUnitForUser } = require("../services/orgUnitService");
const { createGrantForUser, revokeGrantForUser } = require("../services/orgGrantService");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const actionRepository = require("../repositories/actionRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const planningRepository = require("../repositories/planningRepository");
const { buildAssistantContext } = require("../services/assistantContextService");
const { buildPortfolioReport, reportToCsv } = require("../services/portfolioReportService");
const { buildAuditContext } = require("../services/auditContextService");
const { listActions, getAction, createAction } = require("../services/actionService");
const { canAccessEntity } = require("../services/evidenceCreationService");

const admin = { id: 1, username: "admin", role: "SUPER_ADMIN" };
const manager = { id: 3, username: "gerente", role: "GERENTE" };
const other = { id: 4, username: "jefatura", role: "JEFATURA" };
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const risk = (title, orgUnitId, linkedAuditId) => riskRepository.create({
  title, description: `Descripción sintética de ${title}`, area: "Área de prueba", ownerId: 5,
  ownerName: "Auditor de prueba", responsePlan: "Revisar el escenario", linkedAuditId,
  ...(orgUnitId ? { orgUnitId } : {}), likelihood: 2, impact: 2,
  score: 4, level: "Medio", note: "Evaluación inicial de prueba",
  createdBy: { id: 1, username: "admin", role: "SUPER_ADMIN" }
});

test("scope read projections use direct grants and hide denied records from list, report, dossier and AI", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Date.now().toString(36).toUpperCase();
  const group = await createOrgUnitForUser(admin, { code: `GP_${stamp}`, name: "Grupo sintético", kind: "GROUP" });
  const first = await createOrgUnitForUser(admin, { code: `LE_A_${stamp}`, name: "Empresa A sintética",
    kind: "LEGAL_ENTITY", parentId: group.id });
  const second = await createOrgUnitForUser(admin, { code: `LE_B_${stamp}`, name: "Empresa B sintética",
    kind: "LEGAL_ENTITY", parentId: group.id });
  const child = await createOrgUnitForUser(admin, { code: `BU_${stamp}`, name: "Unidad sin herencia",
    kind: "BUSINESS_UNIT", parentId: first.id });
  const grant = await createGrantForUser(admin, first.id, { userId: 3, accessLevel: "VIEW",
    reason: "Acceso sintético a la empresa A" });
  const audit = planningRepository.create({ title: `Auditoría A ${stamp}`, objective: "Objetivo de prueba",
    area: "Área de prueba", type: "Interna", year: 2026, quarter: "Q1",
    responsibleId: 3, responsible: "Gerente", risk: "Medio", orgUnitId: first.id });
  const deniedAudit = planningRepository.create({ title: `Auditoría B ${stamp}`, objective: "Objetivo ajeno",
    area: "Área de prueba", type: "Interna", year: 2026, quarter: "Q1",
    responsibleId: 3, responsible: "Gerente", risk: "Alto", orgUnitId: second.id });
  const firstRisk = risk(`Riesgo A ${stamp}`, first.id, audit.id);
  const deniedRisk = risk(`Riesgo B ${stamp}`, second.id, audit.id);
  const childRisk = risk(`Riesgo hijo ${stamp}`, child.id, audit.id);
  const legacyRisk = risk(`Riesgo legado ${stamp}`, null, audit.id);
  const control = (title, riskIds) => controlRepository.create({ title, description: "Control sintético",
    riskIds, effectiveness: 3, note: "Evaluación de prueba", createdBy: admin });
  const allowedControl = control(`Control A ${stamp}`, [firstRisk.id]);
  const deniedControl = control(`Control B ${stamp}`, [deniedRisk.id]);
  const mixedControl = control(`Control compartido ${stamp}`, [firstRisk.id, deniedRisk.id]);
  const allowedFinding = findingRepository.create({ title: `Hallazgo A ${stamp}`, riskId: firstRisk.id,
    controlId: allowedControl.id, auditId: audit.id, createdBy: admin });
  const deniedFinding = findingRepository.create({ title: `Hallazgo B ${stamp}`, riskId: deniedRisk.id,
    controlId: deniedControl.id, auditId: audit.id, createdBy: admin });
  const deniedAction = actionRepository.create({
    sourceType: "RISK", sourceId: deniedRisk.id, sourceTitle: deniedRisk.title,
    title: `Pendiente restringido ${stamp}`, assigneeId: manager.id,
    dueDate: new Date().toISOString().slice(0, 10), status: "OPEN", history: []
  });
  const allowedAction = actionRepository.create({
    sourceType: "RISK", sourceId: firstRisk.id, sourceTitle: firstRisk.title,
    title: `Pendiente permitido ${stamp}`, assigneeId: manager.id,
    dueDate: new Date().toISOString().slice(0, 10), status: "OPEN", history: []
  });
  const allowedEvidence = evidenceRepository.create({ title: `Evidencia A ${stamp}`,
    description: "Referencia sintética", entityType: "RISK", entityId: firstRisk.id,
    entityTitle: firstRisk.title, author: admin });
  const deniedEvidence = evidenceRepository.create({ title: `Evidencia B ${stamp}`,
    description: "Referencia sintética", entityType: "RISK", entityId: deniedRisk.id,
    entityTitle: deniedRisk.title, author: admin });
  const url = `${base}/api/risks/`;
  const list = async (id) => (await (await fetch(url, { headers: {
    Authorization: `Bearer ${token(id)}`
  } })).json()).risks;
  const managerList = await list(3);
  assert.ok(managerList.some((item) => item.id === firstRisk.id));
  assert.ok(managerList.some((item) => item.id === legacyRisk.id));
  assert.ok(!managerList.some((item) => item.id === deniedRisk.id || item.id === childRisk.id));
  assert.ok((await list(1)).some((item) => item.id === deniedRisk.id));
  assert.ok(!(await list(4)).some((item) => item.id === firstRisk.id));

  const assistant = await buildAssistantContext(manager, `riesgos ${stamp}`);
  assert.ok(assistant.sourceCatalog.some((item) => item.id === firstRisk.id));
  assert.ok(!assistant.sourceCatalog.some((item) => item.id === deniedRisk.id || item.id === childRisk.id));
  assert.ok(assistant.sourceCatalog.some((item) => item.id === allowedControl.id));
  assert.ok(!assistant.sourceCatalog.some((item) =>
    [deniedControl.id, mixedControl.id, deniedFinding.id].includes(item.id)));
  assert.ok(!assistant.visibleRecords.pending.some((item) => item.entityId === deniedAction.id));
  const report = await buildPortfolioReport(manager, {});
  const reportRow = report.rows.find((row) => row.audit.id === audit.id);
  assert.ok(reportRow.risks.some((item) => item.id === firstRisk.id));
  assert.ok(!reportRow.risks.some((item) => item.id === deniedRisk.id || item.id === childRisk.id));
  assert.ok(reportRow.controls.some((item) => item.id === allowedControl.id));
  assert.ok(!reportRow.controls.some((item) => [deniedControl.id, mixedControl.id].includes(item.id)));
  assert.ok(reportRow.findings.some((item) => item.id === allowedFinding.id));
  assert.ok(!reportRow.findings.some((item) => item.id === deniedFinding.id));
  assert.ok(!reportToCsv(report).includes(deniedRisk.title));
  const dossier = await buildAuditContext(manager, audit.id);
  assert.ok(dossier.groups.risks.some((item) => item.id === firstRisk.id));
  assert.ok(!dossier.groups.risks.some((item) => item.id === deniedRisk.id));
  assert.ok(!dossier.groups.controls.some((item) => item.id === mixedControl.id));
  assert.ok(!dossier.groups.findings.some((item) => item.id === deniedFinding.id));
  await assert.rejects(() => buildAuditContext(other, audit.id), { status: 404 });

  const getItems = async (path) => (await (await fetch(`${base}${path}`, { headers: {
    Authorization: `Bearer ${token(3)}`
  } })).json());
  const listedControls = (await getItems("/api/controls")).controls;
  assert.ok(listedControls.some((item) => item.id === allowedControl.id));
  assert.ok(!listedControls.some((item) => [deniedControl.id, mixedControl.id].includes(item.id)));
  const listedFindings = (await getItems("/api/findings")).findings;
  assert.ok(listedFindings.some((item) => item.id === allowedFinding.id));
  assert.ok(!listedFindings.some((item) => item.id === deniedFinding.id));
  const dashboard = await getItems("/api/dashboard");
  assert.ok(dashboard.pendingItems.some((item) => item.id === audit.id));
  assert.ok(!dashboard.pendingItems.some((item) => item.id === deniedAudit.id));
  const listedEvidence = (await getItems("/api/evidence")).evidence;
  assert.ok(listedEvidence.some((item) => item.id === allowedEvidence.id));
  assert.ok(!listedEvidence.some((item) => item.id === deniedEvidence.id));
  assert.equal(await canAccessEntity("RISK", deniedRisk.id, manager), false);
  assert.ok((await listActions(manager)).some((item) => item.id === allowedAction.id));
  assert.ok(!(await listActions(manager)).some((item) => item.id === deniedAction.id));
  await assert.rejects(() => getAction(manager, deniedAction.id), { status: 404 });
  await assert.rejects(() => createAction(manager,
    { sourceType: "RISK", sourceId: deniedRisk.id }), { status: 404 });

  await revokeGrantForUser(admin, grant.id, { reason: "Terminó el acceso sintético" });
  assert.ok(!(await list(3)).some((item) => item.id === firstRisk.id));
  assert.ok((await list(3)).some((item) => item.id === legacyRisk.id));
  assert.equal(await canAccessEntity("RISK", firstRisk.id, manager), false);
  assert.ok(!(await listActions(manager)).some((item) => item.id === allowedAction.id));
});
