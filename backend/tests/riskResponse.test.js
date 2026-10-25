const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "risk-response-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (id, body) => ({ method: "POST", headers: { Authorization: `Bearer ${token(id)}`,
  "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("response strategy is proposed, scoped, versioned and never treated as approved acceptance", async (context) => {
  const base = await startTestServer(context, app);
  const created = await fetch(`${base}/api/risks`, json(3, {
    title: `Riesgo de respuesta ${Date.now()}`,
    description: "Escenario sintético para revisar estrategias de respuesta.",
    area: "Operaciones", ownerId: 5, likelihood: 2, impact: 2,
    note: "Valoración inicial sintética para la prueba."
  }));
  assert.equal(created.status, 201);
  const risk = (await created.json()).risk;
  const url = `${base}/api/risks/${risk.id}/response`;
  const firstBody = { strategy: "REDUCE", rationale: "La exposición merece una acción documentada.",
    actions: "Revisar el proceso y reunir evidencia de seguimiento.", ownerId: 5,
    reviewDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), expectedRevision: 0 };
  assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(firstBody) })).status, 401);
  assert.equal((await fetch(url, json(5, firstBody))).status, 403);
  assert.equal((await fetch(url, json(3, { ...firstBody, ownerId: 9999 }))).status, 400);
  assert.equal((await fetch(url, json(3, { ...firstBody, expectedRevision: undefined }))).status, 409);
  assert.equal((await fetch(url, json(3, { ...firstBody, reviewDate: "2020-01-01" }))).status, 400);
  const first = await fetch(url, json(3, firstBody));
  assert.equal(first.status, 200);
  const afterFirst = (await first.json()).risk;
  assert.equal(afterFirst.responseDecisions.length, 1);
  assert.equal(afterFirst.responseDecisions[0].status, "PROPOSED");
  assert.equal(afterFirst.responseDecisions[0].ownerId, 5);
  assert.equal(afterFirst.evaluations.length, 1);
  assert.equal(afterFirst.score, risk.score);
  assert.equal((await fetch(url, json(3, firstBody))).status, 409);
  const second = await fetch(url, json(3, { ...firstBody, strategy: "ACCEPT", expectedRevision: 1,
    rationale: "Se propone aceptar la exposición para revisión formal." }));
  assert.equal(second.status, 200);
  const afterSecond = (await second.json()).risk;
  assert.deepEqual(afterSecond.responseDecisions.map((decision) => decision.strategy), ["REDUCE", "ACCEPT"]);
  assert.ok(afterSecond.responseDecisions.every((decision) => decision.status === "PROPOSED"));
  const visible = await fetch(`${base}/api/risks`, { headers: { Authorization: `Bearer ${token(5)}` } });
  assert.equal(visible.status, 200);
  const record = (await visible.json()).risks.find((item) => item.id === risk.id);
  assert.equal(record.responseDecisions[0].strategy, "REDUCE");
  assert.equal(record.responseDecisions[1].strategy, "ACCEPT");
});
