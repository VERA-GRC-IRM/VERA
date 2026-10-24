const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "risk-method-preview-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { validateMethod, previewQualitativeMethod } = require("../services/riskMethodPreviewService");

const method = { name: "Matriz sintética de prueba", version: "draft-1",
  likelihood: ["Rara", "Posible", "Frecuente"],
  impact: ["Menor", "Moderado", "Grave"],
  levels: ["Bajo", "Medio", "Alto"],
  matrix: [
    ["Bajo", "Bajo", "Medio"],
    ["Bajo", "Medio", "Alto"],
    ["Medio", "Alto", "Alto"]
  ] };
const body = { method, stage: "INHERENT", likelihoodIndex: 2, impactIndex: 2,
  assumptionNote: "Supuestos sintéticos para revisión." };

test("qualitative preview classifies complete monotone matrices without treating ranks as money", () => {
  assert.equal(validateMethod(method).matrix.length, 3);
  assert.equal(previewQualitativeMethod(body).level, "Medio");
  for (let likelihoodIndex = 1; likelihoodIndex <= 3; likelihoodIndex += 1) {
    for (let impactIndex = 1; impactIndex <= 3; impactIndex += 1) {
      const preview = previewQualitativeMethod({ ...body, likelihoodIndex, impactIndex });
      assert.equal(preview.level, method.matrix[likelihoodIndex - 1][impactIndex - 1]);
      assert.equal(preview.approvedEnterprisePolicy, false);
      assert.equal(preview.persisted, false);
      assert.equal(preview.controlsEvaluatedBySystem, false);
      assert.equal("score" in preview, false);
    }
  }
  assert.throws(() => validateMethod({ ...method, matrix: [["Bajo"]] }), /combinación/);
  assert.throws(() => validateMethod({ ...method, matrix: [
    ["Bajo", "Medio", "Alto"], ["Medio", "Bajo", "Alto"], ["Medio", "Alto", "Alto"]
  ] }), /severidad/);
  assert.throws(() => previewQualitativeMethod({ ...body, likelihoodIndex: 4 }), /categorías válidas/);
  assert.throws(() => previewQualitativeMethod({ ...body, stage: "RESIDUAL" }), /Evidencia de controles/);
  assert.equal(previewQualitativeMethod({ ...body, stage: "RESIDUAL",
    controlEvidenceNote: "Prueba sintética de controles" }).stage, "RESIDUAL");
  assert.throws(() => previewQualitativeMethod({ ...body, stage: "TARGET" }), /Supuesto de tratamiento/);
});

test("method preview endpoint is authenticated and restricted to Super Admin", async (context) => {
  const base = await startTestServer(context, app);
  const url = `${base}/api/risks/methods/preview`;
  const send = (id) => fetch(url, { method: "POST",
    headers: { ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
      "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await send()).status, 401);
  assert.equal((await send(3)).status, 403);
  const response = await send(1);
  assert.equal(response.status, 200);
  const preview = (await response.json()).preview;
  assert.equal(preview.level, "Medio");
  assert.equal(preview.persisted, false);
});
