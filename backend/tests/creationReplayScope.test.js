const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const riskRepository = require("../repositories/riskRepository");
const { createAction } = require("../services/actionService");
const { createEvidenceForUser } = require("../services/evidenceCreationService");
const { canReplayAction, canReplayEvidence } = require("../services/creationReplayScope");

const manager = { id: 3, username: "gerente", role: "GERENTE", name: "Gerente de prueba" };
const other = { id: 4, username: "jefatura", role: "JEFATURA", name: "Jefatura de prueba" };

test("un identificador de reintento no concede acceso a otro actor u origen", async () => {
  const first = riskRepository.create({ title: `Primer riesgo ${randomUUID()}`, ownerId: 5,
    level: "Medio", score: 4, likelihood: 2, impact: 2, createdBy: manager });
  const second = riskRepository.create({ title: `Segundo riesgo ${randomUUID()}`, ownerId: 5,
    level: "Medio", score: 4, likelihood: 2, impact: 2, createdBy: manager });
  const operationId = randomUUID();
  const input = { sourceType: "RISK", sourceId: first.id, title: "Revisar control de prueba",
    rationale: "Se requiere documentar la revisión del control.", dueDate: "2026-12-01", assigneeId: 3 };
  const created = await createAction(manager, input, { operationId });
  assert.equal((await createAction(manager, input, { operationId })).id, created.id);
  await assert.rejects(() => createAction(other, input, { operationId }), { status: 409 });
  await assert.rejects(() => createAction(manager, { ...input, sourceId: second.id }, { operationId }),
    { status: 409 });
  assert.equal(canReplayAction(created, other, input), false);
});

test("el reintento de evidencia exige el mismo autor y los mismos datos", async () => {
  const operationId = randomUUID();
  const input = { title: `Acta de prueba ${operationId}`, description: "Documento de una revisión sintética.",
    evidenceType: "DOCUMENT", reference: "https://example.com/acta", entityType: "AUDIT", entityId: "AUD-01" };
  const created = await createEvidenceForUser(manager, input, operationId);
  assert.equal((await createEvidenceForUser(manager, input, operationId)).id, created.id);
  await assert.rejects(() => createEvidenceForUser(other, input, operationId), { status: 409 });
  await assert.rejects(() => createEvidenceForUser(manager, { ...input, title: "Acta distinta" }, operationId),
    { status: 409 });
  assert.equal(canReplayEvidence(created, other, input), false);
});

test("el reintento conserva el ámbito de origen y admite registros legados sin ámbito", () => {
  const fields = { sourceType: "RISK", sourceId: "RSK-TEST", title: "Revisión",
    rationale: "Motivo", dueDate: "2026-12-01", assigneeId: manager.id };
  const action = { ...fields, createdBy: { id: manager.id }, orgUnitId: "ORG-A" };
  assert.equal(canReplayAction(action, manager, { ...fields, orgUnitId: "ORG-A" }), true);
  assert.equal(canReplayAction(action, manager, { ...fields, orgUnitId: "ORG-B" }), false);
  const legacy = { ...fields, createdBy: { id: manager.id } };
  assert.equal(canReplayAction(legacy, manager, { ...fields, orgUnitId: null }), true);

  const evidenceFields = { title: "Acta", description: "Documento", evidenceType: "DOCUMENT",
    reference: "https://example.com/acta", entityType: "RISK", entityId: "RSK-TEST" };
  const evidence = { ...evidenceFields, author: { id: manager.id }, orgUnitId: "ORG-A" };
  assert.equal(canReplayEvidence(evidence, manager, { ...evidenceFields, orgUnitId: "ORG-A" }), true);
  assert.equal(canReplayEvidence(evidence, manager, { ...evidenceFields, orgUnitId: "ORG-B" }), false);
});
