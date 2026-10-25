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
const { canAccessEntity, createEvidenceForUser } = require("../services/evidenceCreationService");
const { evaluateRiskForUser } = require("../services/riskEvaluationService");
const { evaluateControlForUser } = require("../services/controlEvaluationService");
const { updateCoreForUser } = require("../services/recordEditService");
const { createRiskForUser } = require("../services/riskCreationService");
const { createControlForUser } = require("../services/controlCreationService");
const { createFindingForUser } = require("../services/findingCreationService");
const { closeFindingForUser } = require("../services/findingClosureService");
const { applyTransition } = require("../services/planningTransitionService");
const { updateProposalForUser } = require("../services/proposalService");
const { createCommentForUser } = require("../services/planningCommentService");
const { visibleNotifications } = require("../services/notificationWorkflowService");
const { visibleCollectionsForUser } = require("../services/recordReadAccessService");
const { handleRiskEvaluation } = require("../services/assistantRiskEvaluationService");
const { handleControlEvaluation } = require("../services/assistantControlEvaluationService");
const { handleFindingClose } = require("../services/assistantFindingCloseService");
const { handleFindingCreate } = require("../services/assistantFindingCreateService");
const { handleRiskCreate } = require("../services/assistantRiskCreateService");

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
  const crossLinkedRisk = risk(`Riesgo A enlace externo ${stamp}`, first.id, deniedAudit.id);
  const deniedRisk = risk(`Riesgo B ${stamp}`, second.id, audit.id);
  const childRisk = risk(`Riesgo hijo ${stamp}`, child.id, audit.id);
  const legacyRisk = risk(`Riesgo legado ${stamp}`, null, audit.id);
  const control = (title, riskIds, orgUnitId) => controlRepository.create({ title, description: "Control sintético",
    riskIds, orgUnitId, effectiveness: 3, note: "Evaluación de prueba", createdBy: admin });
  const allowedControl = control(`Control A ${stamp}`, [firstRisk.id], first.id);
  const deniedControl = control(`Control B ${stamp}`, [deniedRisk.id], second.id);
  const mixedControl = control(`Control compartido ${stamp}`, [firstRisk.id, deniedRisk.id], first.id);
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
    entityTitle: deniedRisk.title, author: admin,
    file: { bucket: "synthetic", path: `private/${stamp}`, mime: "application/pdf" } });
  const rejected = (operation) => operation().then(() => null, (error) =>
    ({ status: error.status, message: error.message }));
  const riskInput = { title: `Riesgo vínculo ${stamp}`, description: "Descripción sintética de vínculo",
    area: "Operaciones", ownerId: 5, likelihood: 2, impact: 3,
    note: "Evaluación sintética documentada" };
  const deniedAuditLink = await rejected(() => createRiskForUser(manager,
    { ...riskInput, linkedAuditId: deniedAudit.id }));
  const missingAuditLink = await rejected(() => createRiskForUser(manager,
    { ...riskInput, linkedAuditId: "AUD-INEXISTENTE" }));
  assert.deepEqual(deniedAuditLink, missingAuditLink);
  assert.equal(deniedAuditLink.status, 404);
  const controlInput = { title: `Control vínculo ${stamp}`, description: "Control sintético para el vínculo",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 5, rating: 2,
    note: "Evaluación sintética documentada" };
  const deniedRiskLink = await rejected(() => createControlForUser(manager,
    { ...controlInput, riskIds: [deniedRisk.id] }));
  const missingRiskLink = await rejected(() => createControlForUser(manager,
    { ...controlInput, riskIds: ["RSK-INEXISTENTE"] }));
  assert.deepEqual(deniedRiskLink, missingRiskLink);
  assert.equal(deniedRiskLink.status, 404);
  const url = `${base}/api/risks/`;
  const list = async (id) => (await (await fetch(url, { headers: {
    Authorization: `Bearer ${token(id)}`
  } })).json()).risks;
  const managerList = await list(3);
  assert.ok(managerList.some((item) => item.id === firstRisk.id));
  assert.equal(managerList.find((item) => item.id === crossLinkedRisk.id).linkedAuditId, null);
  assert.equal((await visibleCollectionsForUser(manager)).RISK
    .find((item) => item.id === crossLinkedRisk.id).linkedAuditId, null);
  assert.ok(managerList.some((item) => item.id === legacyRisk.id));
  assert.ok(!managerList.some((item) => item.id === deniedRisk.id || item.id === childRisk.id));
  assert.ok((await list(1)).some((item) => item.id === deniedRisk.id));
  assert.ok(!(await list(4)).some((item) => item.id === firstRisk.id));

  const assistant = await buildAssistantContext(manager, `riesgos ${stamp}`);
  assert.ok(assistant.sourceCatalog.some((item) => item.id === firstRisk.id));
  assert.equal(assistant.visibleRecords.risks
    .find((item) => item.id === crossLinkedRisk.id).linkedAuditId, null);
  assert.ok(!assistant.sourceCatalog.some((item) => item.id === deniedRisk.id || item.id === childRisk.id));
  assert.ok(assistant.sourceCatalog.some((item) => item.id === allowedControl.id));
  assert.ok(!assistant.sourceCatalog.some((item) =>
    [deniedControl.id, mixedControl.id, deniedFinding.id].includes(item.id)));
  assert.ok(!assistant.visibleRecords.pending.some((item) => item.entityId === deniedAction.id));
  const emptyThread = { messages: [] };
  const hiddenRiskPreview = await handleRiskEvaluation(manager,
    `Evalúa el riesgo «${deniedRisk.title}» con probabilidad 2 e impacto 3 porque el caso requiere revisión`,
    emptyThread);
  assert.equal(hiddenRiskPreview.mode, "action-guidance");
  assert.ok(!hiddenRiskPreview.answer.includes(deniedRisk.id));
  assert.equal(hiddenRiskPreview.actionDraft, undefined);
  const hiddenControlPreview = await handleControlEvaluation(manager,
    `Evalúa el control «${deniedControl.title}» con efectividad 2 porque el caso requiere revisión`,
    emptyThread);
  assert.equal(hiddenControlPreview.mode, "action-guidance");
  assert.ok(!hiddenControlPreview.answer.includes(deniedControl.id));
  assert.equal(hiddenControlPreview.actionDraft, undefined);
  const hiddenFindingPreview = await handleFindingClose(manager,
    `Cierra el hallazgo ${deniedFinding.id} porque el caso requiere revisión documentada`, emptyThread);
  assert.equal(hiddenFindingPreview.mode, "action-guidance");
  assert.ok(!hiddenFindingPreview.answer.includes(deniedFinding.id));
  const hiddenFindingCreate = await handleFindingCreate(manager,
    `Registrar hallazgo\nTítulo: Hallazgo sintético\nDescripción: Descripción sintética documentada\nControl: ${deniedControl.id}\nRiesgo: ${deniedRisk.id}`,
    emptyThread);
  assert.equal(hiddenFindingCreate.mode, "action-guidance");
  assert.equal(hiddenFindingCreate.actionDraft?.type, "FINDING_FIELDS");
  const riskCommand = (linkedAuditId) => `Registrar riesgo\nTítulo: Riesgo nuevo ${stamp}\n` +
    "Descripción: Escenario sintético con impacto en operaciones\nÁrea: Operaciones\n" +
    "Probabilidad: 2\nImpacto: 3\nJustificación: Evaluación sintética documentada\n" +
    `Responsable: 3\nAuditoría: ${linkedAuditId}`;
  const deniedRiskCreate = await handleRiskCreate(manager, riskCommand(deniedAudit.id), emptyThread);
  const missingRiskCreate = await handleRiskCreate(manager, riskCommand("AUD-INEXISTENTE"), emptyThread);
  const viewRiskCreate = await handleRiskCreate(manager, riskCommand(audit.id), emptyThread);
  assert.equal(deniedRiskCreate.mode, "action-guidance");
  assert.equal(deniedRiskCreate.answer, missingRiskCreate.answer);
  assert.equal(deniedRiskCreate.answer, viewRiskCreate.answer);
  assert.equal(deniedRiskCreate.actionDraft?.type, "RISK_FIELDS");
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
  const statusFor = async (path) => (await fetch(`${base}${path}`, { headers: {
    Authorization: `Bearer ${token(3)}`
  } })).status;
  assert.equal(await statusFor(`/api/planning/${audit.id}/history`), 200);
  assert.equal(await statusFor(`/api/planning/${deniedAudit.id}/history`), 404);
  assert.equal(await statusFor(`/api/planning/${deniedAudit.id}/context`), 404);
  assert.equal(await statusFor(`/api/actions/${deniedAction.id}`), 404);
  assert.equal(await statusFor(`/api/actions/for-audit/${deniedAudit.id}`), 404);
  assert.equal(await statusFor(`/api/actions?sourceType=RISK&sourceId=${deniedRisk.id}`), 404);
  assert.equal(await statusFor(`/api/evidence/${deniedEvidence.id}/download`), 404);
  const listedControls = (await getItems("/api/controls")).controls;
  assert.ok(listedControls.some((item) => item.id === allowedControl.id));
  assert.ok(!listedControls.some((item) => [deniedControl.id, mixedControl.id].includes(item.id)));
  const listedFindings = (await getItems("/api/findings")).findings;
  assert.ok(listedFindings.some((item) => item.id === allowedFinding.id));
  assert.ok(!listedFindings.some((item) => item.id === deniedFinding.id));
  const dashboard = await getItems("/api/dashboard");
  assert.ok(dashboard.pendingItems.some((item) => item.id === audit.id));
  assert.ok(!dashboard.pendingItems.some((item) => item.id === deniedAudit.id));
  const proposals = (await getItems("/api/planning")).proposals;
  assert.ok(proposals.some((item) => item.id === audit.id));
  assert.ok(!proposals.some((item) => item.id === deniedAudit.id));
  const search = (await getItems("/api/planning/search?q=Auditoría")).audits;
  assert.ok(!search.some((item) => item.id === deniedAudit.id));
  const notices = (await visibleNotifications(manager)).notifications;
  assert.ok(!notices.some((item) => item.entityId === deniedAudit.id));
  const listedEvidence = (await getItems("/api/evidence")).evidence;
  assert.ok(listedEvidence.some((item) => item.id === allowedEvidence.id));
  assert.ok(!listedEvidence.some((item) => item.id === deniedEvidence.id));
  assert.equal(await canAccessEntity("RISK", deniedRisk.id, manager), false);
  assert.ok((await listActions(manager)).some((item) => item.id === allowedAction.id));
  assert.ok(!(await listActions(manager)).some((item) => item.id === deniedAction.id));
  await assert.rejects(() => getAction(manager, deniedAction.id), { status: 404 });
  await assert.rejects(() => createAction(manager,
    { sourceType: "RISK", sourceId: deniedRisk.id }), { status: 404 });
  await assert.rejects(() => createAction(manager,
    { sourceType: "RISK", sourceId: firstRisk.id }), { status: 403 });
  const evidenceInput = { title: `Nueva evidencia ${stamp}`, description: "Referencia sintética válida.",
    evidenceType: "DOCUMENT", reference: "https://example.test/evidence",
    entityType: "RISK", entityId: firstRisk.id };
  await assert.rejects(() => createEvidenceForUser(manager, evidenceInput), { status: 403 });
  const findingInput = { title: `Nuevo hallazgo ${stamp}`, description: "Descripción sintética válida.",
    riskId: firstRisk.id, controlId: allowedControl.id };
  await assert.rejects(() => createFindingForUser(manager, findingInput), { status: 403 });
  await assert.rejects(() => closeFindingForUser(manager, allowedFinding.id,
    "Motivo de cierre sintético", allowedFinding.storageVersion), { status: 403 });
  await assert.rejects(() => applyTransition(manager, audit.id, "approve", { quarter: "Q1" }), { status: 403 });
  await assert.rejects(() => applyTransition(manager, deniedAudit.id, "approve", { quarter: "Q1" }), { status: 404 });
  await assert.rejects(() => updateProposalForUser(manager, audit.id, { title: "Título editado" }),
    { status: 403 });
  await assert.rejects(() => createCommentForUser(manager, audit.id,
    { text: "Comentario sintético" }), { status: 403 });
  const assessment = { likelihood: 2, impact: 3, note: "Evaluación sintética documentada." };
  await assert.rejects(() => evaluateRiskForUser(manager, firstRisk.id, assessment), { status: 403 });
  await assert.rejects(() => evaluateRiskForUser(manager, deniedRisk.id, assessment), { status: 404 });
  await assert.rejects(() => evaluateControlForUser(manager, allowedControl.id,
    { rating: 2, note: "Evaluación sintética documentada." }), { status: 403 });
  await assert.rejects(() => updateCoreForUser(manager, "RISK", firstRisk.id, firstRisk), { status: 403 });
  const inheritedRisk = await createRiskForUser(admin, {
    title: `Riesgo sin ámbito ${stamp}`, description: "Descripción sintética válida.",
    area: "Área de prueba", ownerId: 5, linkedAuditId: audit.id,
    ...assessment
  });
  assert.equal(inheritedRisk.orgUnitId, first.id);
  const inheritedControl = await createControlForUser(admin, {
    title: `Control sin ámbito ${stamp}`, description: "Descripción sintética válida.",
    type: "PREVENTIVE", frequency: "Monthly", ownerId: 5, riskIds: [firstRisk.id],
    rating: 3, note: "Evaluación sintética documentada."
  });
  assert.equal(inheritedControl.orgUnitId, first.id);

  await revokeGrantForUser(admin, grant.id, { reason: "Terminó el acceso sintético" });
  assert.ok(!(await list(3)).some((item) => item.id === firstRisk.id));
  assert.ok((await list(3)).some((item) => item.id === legacyRisk.id));
  assert.equal(await canAccessEntity("RISK", firstRisk.id, manager), false);
  assert.ok(!(await listActions(manager)).some((item) => item.id === allowedAction.id));
  const manage = await createGrantForUser(admin, first.id, { userId: 3, accessLevel: "MANAGE",
    reason: "Gestión sintética de la empresa A" });
  assert.equal((await evaluateRiskForUser(manager, firstRisk.id, assessment)).score, 6);
  assert.equal((await evaluateControlForUser(manager, allowedControl.id,
    { rating: 2, note: "Evaluación sintética documentada." })).effectiveness, 2);
  const scopedAction = await createAction(manager,
    { sourceType: "RISK", sourceId: firstRisk.id, title: `Compromiso A ${stamp}`,
      rationale: "Seguimiento sintético del riesgo de la empresa A.", dueDate: "2026-12-01",
      assigneeId: manager.id });
  assert.equal(scopedAction.orgUnitId, first.id);
  await assert.rejects(() => createAction(manager,
    { sourceType: "RISK", sourceId: crossLinkedRisk.id }), { status: 404 });
  const scopedEvidence = await createEvidenceForUser(manager, evidenceInput);
  const scopedFinding = await createFindingForUser(manager, findingInput);
  const scopedComment = await createCommentForUser(manager, audit.id,
    { text: "Comentario sintético" });
  assert.equal(scopedEvidence.orgUnitId, first.id);
  assert.equal(scopedFinding.orgUnitId, first.id);
  assert.equal(scopedComment.orgUnitId, first.id);
  const mismatchedControl = control(`Control mixto inválido ${stamp}`, [firstRisk.id], second.id);
  await assert.rejects(() => createFindingForUser(admin, { ...findingInput,
    controlId: mismatchedControl.id }), { status: 409 });
  await assert.rejects(() => createAction(admin, { sourceType: "CONTROL",
    sourceId: mismatchedControl.id }), { status: 409 });
  assert.equal((await applyTransition(manager, audit.id, "approve", { quarter: "Q1" })).record.status,
    "APPROVED");
  await revokeGrantForUser(admin, manage.id, { reason: "Terminó la gestión sintética" });
  await assert.rejects(() => getAction(manager, scopedAction.id), { status: 404 });
  assert.equal(await canAccessEntity("RISK", scopedEvidence.entityId, manager), false);
  assert.ok(!(await getItems(`/api/findings`)).findings.some((item) => item.id === scopedFinding.id));
  assert.equal(await statusFor(`/api/planning/${audit.id}/history`), 404);
});
