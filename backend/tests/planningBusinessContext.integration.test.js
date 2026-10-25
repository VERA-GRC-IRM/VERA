const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "planning-context-links-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const send = (base, path, { id = 1, method = "GET", body } = {}) => fetch(`${base}${path}`, {
  method, headers: { Authorization: `Bearer ${token(id)}`,
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("planning links an exact business concept revision in the same scope", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  const unit = async (code) => {
    const response = await send(base, "/api/org-units", { method: "POST", body: {
      kind: "GROUP", code: `${code}_${stamp}`, name: `Grupo sintético ${code}`, effectiveFrom: "2026-01-01" } });
    assert.equal(response.status, 201);
    return (await response.json()).unit;
  };
  const firstUnit = await unit("ONE");
  const otherUnit = await unit("TWO");
  const createConcept = async (orgUnit, code) => {
    const response = await send(base, "/api/business-context", { method: "POST", body: {
      kind: "PROCESS", code: `${code}_${stamp}`, name: `Proceso sintético ${code}`,
      description: "Contexto sintético para una propuesta de auditoría.",
      effectiveFrom: "2026-01-01", unitIds: [orgUnit.id] } });
    assert.equal(response.status, 201);
    return (await response.json()).record;
  };
  const concept = await createConcept(firstUnit, "PRONE");
  const other = await createConcept(otherUnit, "PRTWO");
  const revisedResponse = await send(base, `/api/business-context/${concept.contextId}/revisions`, {
    method: "POST", body: { kind: "PROCESS", code: concept.code, name: "Proceso sintético revisado",
      description: "Segunda versión sintética del proceso auditado.",
      effectiveFrom: "2026-01-01", unitIds: [firstUnit.id], expectedRevision: 1,
      changeReason: "Se aclaró la definición sin borrar la primera versión" } });
  assert.equal(revisedResponse.status, 201);
  const reference = { contextId: concept.contextId, revision: 1 };
  const proposal = { title: `Auditoría de contexto ${stamp}`, area: "Operaciones sintéticas",
    objective: "Examinar un proceso sintético y conservar su versión.",
    scope: "Proceso sintético dentro de una sola unidad empresarial.",
    justification: "Verificar el alcance declarado antes de la aprobación.",
    quarter: "Q1", year: 2026, orgUnitId: firstUnit.id };
  const createResponse = await send(base, "/api/planning", { method: "POST", body: {
    ...proposal, businessContextReferences: [reference] } });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).proposal;
  assert.deepEqual(created.businessContextReferences, [{ contextId: concept.contextId, revision: 1,
    kind: "PROCESS", code: concept.code, name: concept.name }]);
  assert.equal((await send(base, "/api/planning", { method: "POST", body: {
    ...proposal, title: `Auditoría cruzada ${stamp}`,
    businessContextReferences: [{ contextId: other.contextId, revision: 1 }] } })).status, 400);
  assert.equal((await send(base, `/api/planning/${created.id}`, { method: "PUT", body: {
    businessContextReferences: [{ contextId: other.contextId, revision: 1 }] } })).status, 400);

  const updatedResponse = await send(base, `/api/planning/${created.id}`, { method: "PUT",
    body: { businessContextReferences: [] } });
  assert.equal(updatedResponse.status, 200);
  assert.deepEqual((await updatedResponse.json()).proposal.businessContextReferences, []);
  const listing = (await (await send(base, "/api/planning")).json()).proposals;
  assert.deepEqual(listing.find((item) => item.id === created.id).businessContextReferences, []);
});
