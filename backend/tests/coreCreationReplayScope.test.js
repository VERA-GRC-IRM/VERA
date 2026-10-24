const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const planningRepository = require("../repositories/planningRepository");
const { createRiskForUser } = require("../services/riskCreationService");
const { createControlForUser } = require("../services/controlCreationService");
const { createFindingForUser } = require("../services/findingCreationService");
const { createProposalForUser } = require("../services/proposalService");
const { createCommentForUser } = require("../services/planningCommentService");

const manager = { id: 3, username: "gerente", role: "GERENTE" };
const admin = { id: 1, username: "superadmin", role: "SUPER_ADMIN" };
const lead = { id: 4, username: "jefatura", role: "JEFATURA" };

test("una clave de operación ajena no recupera propuestas, riesgos, controles ni hallazgos", async () => {
  const operationIds = Array.from({ length: 4 }, () => randomUUID());
  const proposal = planningRepository.create({ title: `Propuesta ${operationIds[0]}`, area: "Prueba",
    createdBy: { id: manager.id }, aiOperationId: operationIds[0] });
  const risk = riskRepository.create({ title: `Riesgo ${operationIds[1]}`, ownerId: 5,
    likelihood: 2, impact: 2, score: 4, level: "Medio", linkedAuditId: null,
    createdBy: { id: manager.id }, aiOperationId: operationIds[1] });
  const control = controlRepository.create({ title: `Control ${operationIds[2]}`,
    riskIds: [risk.id], effectiveness: 2, note: "Evaluación sintética insuficiente.",
    createdBy: { id: manager.id }, aiOperationId: operationIds[2] });
  const finding = findingRepository.create({ title: `Hallazgo ${operationIds[3]}`,
    riskId: risk.id, controlId: control.id, createdBy: { id: manager.id },
    aiOperationId: operationIds[3] });

  assert.equal((await createProposalForUser(manager, {}, operationIds[0])).id, proposal.id);
  assert.equal((await createRiskForUser(manager, {}, operationIds[1])).id, risk.id);
  assert.equal((await createControlForUser(manager, {}, operationIds[2])).id, control.id);
  assert.equal((await createFindingForUser(manager, {}, operationIds[3])).id, finding.id);
  await assert.rejects(() => createProposalForUser(lead, {}, operationIds[0]), { status: 404 });
  await assert.rejects(() => createRiskForUser(admin, {}, operationIds[1]), { status: 404 });
  await assert.rejects(() => createControlForUser(admin, {}, operationIds[2]), { status: 404 });
  await assert.rejects(() => createFindingForUser(admin, {}, operationIds[3]), { status: 404 });
});

test("un reintento de comentario pertenece al autor, expediente y texto originales", async () => {
  const operationId = randomUUID();
  const body = { text: `Comentario sintético ${operationId}` };
  const created = await createCommentForUser(manager, "AUD-01", body, operationId);
  assert.equal((await createCommentForUser(manager, "AUD-01", body, operationId)).id, created.id);
  await assert.rejects(() => createCommentForUser(lead, "AUD-01", body, operationId), { status: 409 });
  await assert.rejects(() => createCommentForUser(manager, "AUD-01", { text: "Texto diferente" }, operationId),
    { status: 409 });
});
