const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "risk-method-catalog-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const repository = require("../repositories/riskMethodRepository");
const { parseAssessment } = require("../services/riskEvaluationService");

const definition = { name: "Método sintético de revisión", version: "draft-1",
  likelihood: ["Rara", "Frecuente"], impact: ["Menor", "Grave"], levels: ["Bajo", "Alto"],
  matrix: [["Bajo", "Alto"], ["Alto", "Alto"]] };
const headersFor = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  "Content-Type": "application/json" });

test("method catalog keeps immutable draft revisions and never enables a draft for assessment", async (context) => {
  const base = await startTestServer(context, app);
  const url = `${base}/api/risks/methods/drafts`;
  const send = (path, body, id = 1) => fetch(`${url}${path}`, {
    method: "POST", headers: headersFor(id), body: JSON.stringify(body)
  });
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await send("", definition, 3)).status, 403);
  const created = await send("", definition);
  assert.equal(created.status, 201);
  const first = (await created.json()).method;
  assert.equal(first.revision, 1);
  assert.equal(first.status, "DRAFT");
  assert.equal(first.approvedEnterprisePolicy, false);
  assert.equal(first.availableForAssessment, false);
  assert.match(parseAssessment({ methodId: first.methodId, likelihood: 1, impact: 1,
    note: "Justificación suficiente" }).error, /no está habilitada/);
  const secondResponse = await send(`/${encodeURIComponent(first.methodId)}/revisions`, {
    ...definition, version: "draft-2", matrix: [["Bajo", "Bajo"], ["Bajo", "Alto"]],
    revisionReason: "Se ajustó la clasificación de la prueba."
  });
  assert.equal(secondResponse.status, 201);
  const second = (await secondResponse.json()).method;
  assert.equal(second.revision, 2);
  assert.equal((await send(`/${encodeURIComponent(first.methodId)}/revisions`, {
    ...definition, revisionReason: "Versión duplicada intencional"
  })).status, 409);
  const revisionsResponse = await fetch(`${url}/${encodeURIComponent(first.methodId)}/revisions`, { headers: headersFor(1) });
  assert.equal(revisionsResponse.status, 200);
  const revisions = (await revisionsResponse.json()).revisions;
  assert.deepEqual(revisions.map((item) => item.version), ["draft-1", "draft-2"]);
  assert.equal((await repository.getAll()).find((item) => item.id === first.id).matrix[0][1], "Alto");
  const catalog = await fetch(url, { headers: headersFor(1) });
  assert.equal((await catalog.json()).methods.find((item) => item.methodId === first.methodId).revision, 2);
  assert.equal((await fetch(`${base}/api/risks/methods`, { headers: headersFor(3) })).status, 200);
  assert.equal((await fetch(url, { headers: headersFor(3) })).status, 403);
});

test("method drafts reject incomplete and non-monotone matrices before persistence", async (context) => {
  const base = await startTestServer(context, app);
  const url = `${base}/api/risks/methods/drafts`;
  for (const matrix of [[['Bajo']], [["Bajo", "Alto"], ["Alto", "Bajo"]]]) {
    const response = await fetch(url, { method: "POST", headers: headersFor(1),
      body: JSON.stringify({ ...definition, matrix }) });
    assert.equal(response.status, 400);
  }
});
