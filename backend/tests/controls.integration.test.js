const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "controls-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-15: controls link to valid risks, retain effectiveness evaluations and respect audit scope", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const manager = tokenFor(3);
  const auditor = tokenFor(5);

  const riskResponse = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", {
    title: `HU-15 riesgo asignado ${Date.now()}`,
    description: "La falta de conciliación puede dejar registros financieros incorrectos.",
    area: "Finanzas", ownerId: 5, likelihood: 2, impact: 3,
    note: "No existe evidencia reciente de una revisión independiente."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;

  const body = {
    title: `HU-15 control ${Date.now()}`,
    description: "Una persona distinta valida la conciliación y documenta las diferencias.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, riskIds: [risk.id], rating: 4,
    note: "Las últimas muestras revisadas muestran evidencia completa y oportuna."
  };
  const invalidLink = await fetch(`${baseUrl}/api/controls`, json(manager, "POST", { ...body, riskIds: ["RSK-999"] }));
  assert.equal(invalidLink.status, 404);
  const createdResponse = await fetch(`${baseUrl}/api/controls`, json(manager, "POST", body));
  assert.equal(createdResponse.status, 201);
  const control = (await createdResponse.json()).control;
  assert.equal(control.effectiveness, 4);
  assert.equal(control.effectivenessResult, "EFFECTIVE");
  assert.equal(control.riskIds[0], risk.id);
  assert.equal(control.evaluations.length, 1);
  assert.equal(control.evaluations[0].assessedBy.id, 3);
  assert.equal(control.evaluations[0].result, "EFFECTIVE");

  const otherRiskResponse = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", {
    title: `HU-15 riesgo no asignado ${Date.now()}`,
    description: "Un proceso operativo puede interrumpirse por una falla de coordinación.",
    area: "Operaciones", ownerId: 4, likelihood: 2, impact: 2,
    note: "No se reportaron incidentes en la muestra analizada."
  }));
  const otherRisk = (await otherRiskResponse.json()).risk;
  const otherControlResponse = await fetch(`${baseUrl}/api/controls`, json(manager, "POST", {
    ...body, title: `${body.title} otro`, riskIds: [otherRisk.id]
  }));
  const otherControl = (await otherControlResponse.json()).control;

  const auditorControls = await fetch(`${baseUrl}/api/controls`, json(auditor));
  const auditorVisibleControls = (await auditorControls.json()).controls;
  assert.ok(auditorVisibleControls.some((item) => item.id === control.id));
  assert.ok(!auditorVisibleControls.some((item) => item.id === otherControl.id));
  const invalidRating = await fetch(`${baseUrl}/api/controls/${control.id}/evaluate`, json(manager, "POST", { rating: 6, note: "No es una escala válida." }));
  assert.equal(invalidRating.status, 400);
  const evaluationResponse = await fetch(`${baseUrl}/api/controls/${control.id}/evaluate`, json(manager, "POST", { rating: 2, note: "La evidencia del último trimestre mostró varias excepciones." }));
  assert.equal(evaluationResponse.status, 200);
  const evaluated = (await evaluationResponse.json()).control;
  assert.equal(evaluated.effectiveness, 2);
  assert.equal(evaluated.effectivenessResult, "INEFFECTIVE");
  assert.equal(evaluated.evaluations.length, 2);
  assert.equal(evaluated.evaluations[1].version, 2);
  assert.equal(evaluated.evaluations[1].result, "INEFFECTIVE");
  assert.ok(evaluated.evaluations[1].assessedAt);
  assert.equal(evaluated.evaluations[1].assessedBy.id, 3);
  assert.equal(evaluated.evaluations[1].note, "La evidencia del último trimestre mostró varias excepciones.");
  const listed = await fetch(`${baseUrl}/api/controls`, json(manager));
  const listedControl = (await listed.json()).controls.find((item) => item.id === control.id);
  assert.equal(listedControl.effectivenessResult, "INEFFECTIVE");
  assert.deepEqual(listedControl.evaluations.map((item) => item.result), ["EFFECTIVE", "INEFFECTIVE"]);

  const update = await fetch(`${baseUrl}/api/controls/${control.id}`, json(manager, "PUT", { ...body, title: `${body.title} revisado` }));
  assert.equal(update.status, 200);
  assert.equal((await update.json()).control.title, `${body.title} revisado`);
  const forbidden = await fetch(`${baseUrl}/api/controls`, json(tokenFor(4), "POST", body));
  assert.equal(forbidden.status, 403);
  const anonymous = await fetch(`${baseUrl}/api/controls`);
  assert.equal(anonymous.status, 401);
});
