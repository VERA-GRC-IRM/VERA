const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditContext } = require("../services/auditContextService");
const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const evidenceRepository = require("../repositories/evidenceRepository");

test("Contexto compartido: el dossier y el expediente respetan el alcance del Auditor", async () => {
  const audit = planningRepository.create({ title: `Expediente IA ${Date.now()}`,
    objective: "Examinar controles con evidencia.", area: "Operaciones", year: 2026,
    responsibleId: 5, createdBy: { id: 2 } });
  const ownRisk = riskRepository.create({ title: "Riesgo propio", linkedAuditId: audit.id,
    ownerId: 5, level: "Alto", score: 6, likelihood: 3, impact: 2, createdBy: { id: 2 } });
  const foreignRisk = riskRepository.create({ title: "Riesgo de otra cuenta", linkedAuditId: audit.id,
    ownerId: 4, level: "Medio", score: 4, likelihood: 2, impact: 2, createdBy: { id: 2 } });
  const ownControl = controlRepository.create({ title: "Control visible", riskIds: [ownRisk.id, foreignRisk.id],
    description: "Descripción sintética del control visible.", type: "DETECTIVE",
    frequency: "Monthly", ownerId: 5, ownerName: "Auditor", effectiveness: 3, createdBy: { id: 2 } });
  const foreignControl = controlRepository.create({ title: "Control ajeno", riskIds: [foreignRisk.id],
    effectiveness: 2, createdBy: { id: 2 } });
  findingRepository.create({ title: "Hallazgo propio", description: "Hallazgo sintético para edición.",
    rootCause: "Falta una validación independiente en el proceso.",
    severity: "HIGH", responsibleId: 5, responsibleName: "Auditor", riskId: ownRisk.id,
    controlId: ownControl.id, evidenceIds: [], createdBy: { id: 2 } });
  findingRepository.create({ title: "Hallazgo ajeno", riskId: foreignRisk.id,
    controlId: foreignControl.id, createdBy: { id: 2 } });
  for (const [entityType, entityId, title] of [
    ["AUDIT", audit.id, "Evidencia de auditoría"],
    ["RISK", ownRisk.id, "Evidencia de riesgo propio"],
    ["RISK", foreignRisk.id, "Evidencia de riesgo ajeno"],
    ["CONTROL", ownControl.id, "Evidencia de control visible"]
  ]) evidenceRepository.create({ title, description: "Archivo de prueba.", entityType, entityId,
    evidenceType: "DOCUMENT", author: { id: 2, name: "Prueba" } });

  const auditor = await buildAuditContext({ id: 5, role: "AUDITOR" }, audit.id);
  assert.equal(auditor.audit.id, audit.id);
  assert.equal(auditor.mode, "read-only");
  assert.deepEqual(auditor.counts, { risks: 1, controls: 1, findings: 1, evidence: 3 });
  assert.deepEqual(auditor.groups.controls[0].riskIds, [ownRisk.id]);
  assert.equal(auditor.groups.controls[0].type, "DETECTIVE");
  assert.equal(auditor.groups.controls[0].ownerId, 5);
  assert.equal(auditor.groups.controls[0].storageVersion, ownControl.storageVersion);
  assert.equal(auditor.groups.findings[0].rootCause, "Falta una validación independiente en el proceso.");
  assert.equal(auditor.groups.findings[0].severity, "HIGH");
  assert.equal(auditor.groups.findings[0].responsibleId, 5);
  assert.equal(auditor.groups.findings[0].storageVersion, 1);
  assert.ok(!JSON.stringify(auditor).includes("Riesgo de otra cuenta"));
  assert.ok(!JSON.stringify(auditor).includes("Evidencia de riesgo ajeno"));
  assert.ok(Number.isFinite(Date.parse(auditor.asOf)));

  const director = await buildAuditContext({ id: 2, role: "DIRECTOR" }, audit.id);
  assert.deepEqual(director.counts, { risks: 2, controls: 2, findings: 2, evidence: 4 });
  assert.equal(director.scope, "Relaciones del expediente");
});

test("Contexto compartido: IDs inválidos, rol ajeno y auditoría no asignada no filtran datos", async () => {
  const user = { id: 5, role: "AUDITOR" };
  await assert.rejects(() => buildAuditContext(user, ""), (error) => error.status === 400);
  await assert.rejects(() => buildAuditContext({ id: 5, role: "INTRUSO" }, "AUD-01"),
    (error) => error.status === 403);
  await assert.rejects(() => buildAuditContext(user, "AUD-NO-EXISTE"),
    (error) => error.status === 404);
  await assert.rejects(() => buildAuditContext(user, "AUD-01"),
    (error) => error.status === 404 && !error.message.includes("controles de acceso"));
});
