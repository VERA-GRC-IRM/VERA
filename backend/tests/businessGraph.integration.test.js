const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "business-graph-integration-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const send = (base, path, { id = 1, method = "GET", body, auth = true } = {}) => fetch(`${base}${path}`, {
  method, headers: { ...(auth ? { Authorization: `Bearer ${token(id)}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("business graph includes declared relationships and excludes denied scopes", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  assert.equal((await send(base, "/api/business-context/graph", { auth: false })).status, 401);
  const createUnit = async (code) => {
    const response = await send(base, "/api/org-units", { method: "POST", body: {
      code: `${code}_${stamp}`, name: `Grupo ${code} ${stamp}`, kind: "GROUP", effectiveFrom: "2026-01-01" } });
    assert.equal(response.status, 201);
    return (await response.json()).unit;
  };
  const a = await createUnit("GA");
  const b = await createUnit("GB");
  const createContext = async (code, unit, kind = "PROCESS", relationships = []) => {
    const response = await send(base, "/api/business-context", { method: "POST", body: {
      kind, code: `${code}_${stamp}`, name: `${code} ${stamp}`,
      description: `Definición de ${code} para verificar la proyección del mapa de relaciones.`,
      effectiveFrom: "2026-01-01", unitIds: [unit.id], relationships } });
    assert.equal(response.status, 201);
    return (await response.json()).record;
  };
  const objective = await createContext("OBJ", a, "OBJECTIVE");
  const process = await createContext("PROC", a, "PROCESS", [{
    relationType: "SUPPORTS_OBJECTIVE", targetContextId: objective.contextId,
    targetRevision: 1, rationale: "Vínculo declarado para prueba de mapa" }]);
  const hidden = await createContext("HIDDEN", b);
  const grant = await send(base, `/api/org-units/${a.id}/grants`, { method: "POST", body: {
    userId: 3, accessLevel: "VIEW", reason: "Comprobar mapa de negocio por ámbito" } });
  assert.equal(grant.status, 201);
  const riskResponse = await send(base, "/api/risks", { method: "POST", body: {
    title: `Riesgo del mapa ${stamp}`, description: "Riesgo sintético para probar las relaciones explícitas.",
    area: "Operaciones", orgUnitId: a.id, ownerId: 1, likelihood: 2, impact: 3,
    note: "La revisión de prueba identificó una posible excepción operativa.",
    businessContextReferences: [{ contextId: process.contextId, revision: 1 }] } });
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await send(base, "/api/controls", { method: "POST", body: {
    title: `Control del mapa ${stamp}`, description: "Control sintético que verifica el riesgo vinculado.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 1, riskIds: [risk.id], rating: 3,
    note: "Valoración preliminar para mostrar el vínculo sin afirmar eficacia." } });
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const proposalResponse = await send(base, "/api/planning", { method: "POST", body: {
    title: `Auditoría del mapa ${stamp}`, area: "Operaciones", orgUnitId: a.id,
    objective: "Revisar el contexto de negocio asociado al proceso sintético.",
    scope: "Proceso sintético dentro del ámbito asignado.",
    justification: "Comprobar la navegación entre contexto y propuesta.",
    quarter: "Q1", year: 2026, businessContextReferences: [{ contextId: process.contextId, revision: 1 }] } });
  assert.equal(proposalResponse.status, 201);
  const proposal = (await proposalResponse.json()).proposal;
  const linkResponse = await send(base, `/api/risks/audit/${proposal.id}`, { method: "POST",
    body: { mode: "link", riskId: risk.id } });
  assert.equal(linkResponse.status, 201);
  assert.equal((await send(base, `/api/risks/audit/${proposal.id}`, { method: "POST",
    body: { mode: "link", riskId: risk.id } })).status, 409);
  assert.equal((await send(base, `/api/risks/audit/${proposal.id}`, { id: 5 })).status, 404);
  const linked = (await (await send(base, `/api/risks/audit/${proposal.id}`)).json()).risks;
  assert.ok(linked.some(({ id }) => id === risk.id));
  const updatedTitle = `Riesgo revisado del mapa ${stamp}`;
  const updateResponse = await send(base, `/api/risks/audit/${proposal.id}/${risk.id}`, { method: "PATCH",
    body: { title: updatedTitle } });
  assert.equal(updateResponse.status, 200);
  const evaluationResponse = await send(base, `/api/risks/audit/${proposal.id}/${risk.id}/evaluate`, {
    method: "POST", body: { likelihood: 1, impact: 2,
      note: "Se actualizó la evaluación del riesgo vinculado a la auditoría." } });
  assert.equal(evaluationResponse.status, 200);

  const response = await send(base, "/api/business-context/graph", { id: 3 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const graph = await response.json();
  const ids = new Set(graph.nodes.map(({ id }) => id));
  assert.ok(ids.has(`unit:${a.id}`));
  assert.ok(ids.has(`context:${process.contextId}`));
  assert.ok(ids.has(`context:${objective.contextId}`));
  assert.ok(ids.has(`risk:${risk.id}`));
  assert.equal(graph.nodes.find(({ id }) => id === `risk:${risk.id}`).label, updatedTitle);
  assert.ok(ids.has(`control:${control.id}`));
  assert.ok(ids.has(`audit:${proposal.id}`));
  assert.ok(!ids.has(`unit:${b.id}`));
  assert.ok(!ids.has(`context:${hidden.contextId}`));
  assert.ok(graph.edges.some(({ source, target, kind }) => source === `context:${process.contextId}` &&
    target === `context:${objective.contextId}` && kind === "SUPPORTS_OBJECTIVE"));
  assert.ok(graph.edges.some(({ source, target, kind }) => source === `context:${process.contextId}` &&
    target === `risk:${risk.id}` && kind === "CONTEXT_RISK"));
  assert.ok(graph.edges.some(({ source, target, kind }) => source === `control:${control.id}` &&
    target === `risk:${risk.id}` && kind === "TREATS_RISK"));
  assert.ok(graph.edges.some(({ source, target, kind }) => source === `context:${process.contextId}` &&
    target === `audit:${proposal.id}` && kind === "CONTEXT_AUDIT"));
  assert.ok(graph.edges.some(({ source, target, kind }) => source === `risk:${risk.id}` &&
    target === `audit:${proposal.id}` && kind === "RISK_AUDIT"));
  assert.ok(graph.edges.every(({ source, target }) => ids.has(source) && ids.has(target)));
  const auditorGraph = await (await send(base, "/api/business-context/graph", { id: 5 })).json();
  assert.ok(!auditorGraph.nodes.some(({ id }) => id === `risk:${risk.id}` || id === `audit:${proposal.id}`));
  assert.equal((await send(base, `/api/risks/audit/${proposal.id}/${risk.id}`, { method: "DELETE" })).status, 200);
  const afterUnlink = await (await send(base, "/api/business-context/graph", { id: 3 })).json();
  assert.ok(!afterUnlink.edges.some(({ source, target, kind }) => source === `risk:${risk.id}` &&
    target === `audit:${proposal.id}` && kind === "RISK_AUDIT"));
});
