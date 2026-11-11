const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "offline-record-edit-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");

const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  "Content-Type": "application/json" });
const edit = (base, type, id, actor, body) => fetch(`${base}/api/${type}/${id}/offline-description`, {
  method: "PATCH", headers: auth(actor), body: JSON.stringify(body)
});

test("offline description edits require role, exact original version and current scope", async (context) => {
  const base = await startTestServer(context, app);
  const risk = await riskRepository.create({ title: `Riesgo offline ${Date.now()}`,
    description: "Descripción original del riesgo operativo.", area: "Operaciones",
    ownerId: 3, ownerName: "Gerente", responsePlan: "", linkedAuditId: null,
    likelihood: 2, impact: 2, score: 4, level: "Medio", note: "Evaluación inicial",
    storageVersion: 1, createdBy: { id: 3, name: "gerente" } });
  const control = await controlRepository.create({ title: `Control offline ${Date.now()}`,
    description: "Descripción original del control operativo.", type: "PREVENTIVE",
    frequency: "Monthly", ownerId: 3, ownerName: "Gerente", riskIds: [risk.id],
    effectiveness: 4, note: "Evaluación inicial", storageVersion: 1,
    createdBy: { id: 3, name: "gerente", role: "GERENTE" } });
  const payload = (record, description) => ({ description,
    reason: "Se aclaró el alcance en la revisión de campo.",
    expected: { storageVersion: record.storageVersion, updatedAt: record.updatedAt,
      description: record.description } });

  const riskBody = payload(risk, "Descripción revisada del riesgo operativo.");
  assert.equal((await edit(base, "risks", risk.id, 2, riskBody)).status, 403);
  assert.equal((await edit(base, "risks", risk.id, 3, { ...riskBody,
    expected: { ...riskBody.expected, storageVersion: 99 } })).status, 409);
  assert.equal((await riskRepository.findById(risk.id)).description, risk.description);
  const savedRisk = await edit(base, "risks", risk.id, 3, riskBody);
  assert.equal(savedRisk.status, 200);
  assert.equal((await savedRisk.json()).risk.description, riskBody.description);
  assert.equal((await riskRepository.findById(risk.id)).evaluations.length, 1);
  assert.equal((await edit(base, "risks", risk.id, 3, riskBody)).status, 409);

  const controlBody = payload(control, "Descripción revisada del control operativo.");
  const savedControl = await edit(base, "controls", control.id, 3, controlBody);
  assert.equal(savedControl.status, 200);
  assert.equal((await savedControl.json()).control.description, controlBody.description);
  assert.equal((await controlRepository.findById(control.id)).evaluations.length, 1);
  assert.equal((await edit(base, "controls", control.id, 3, { ...controlBody,
    description: "Otro cambio del control operativo.",
    expected: { ...controlBody.expected, description: "Valor obsoleto del control" } })).status, 409);
});
