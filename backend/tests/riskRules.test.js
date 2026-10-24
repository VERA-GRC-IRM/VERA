const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyRisk } = require("../config/riskRules");
const { methodIdFor, stageFor, presentRiskMethod, LEGACY_RISK_METHOD } = require("../config/riskMethods");

test("legacy records retain their historical method without a data rewrite", () => {
  assert.equal(methodIdFor({ score: 6 }), "legacy-3x3-v1");
  assert.equal(stageFor({ score: 6 }), "UNSPECIFIED");
  assert.equal(LEGACY_RISK_METHOD.approvedEnterprisePolicy, false);
  const original = { id: "RSK-old", evaluations: [{ score: 6, note: "Histórico" }] };
  const presented = presentRiskMethod(original);
  assert.equal(presented.methodId, "legacy-3x3-v1");
  assert.equal(presented.evaluations[0].assessmentStage, "UNSPECIFIED");
  assert.equal(original.evaluations[0].methodId, undefined);
});

test("risk matrix classifies each valid probability and impact combination", () => {
  const expected = [
    ["Bajo", "Bajo", "Medio"],
    ["Bajo", "Medio", "Alto"],
    ["Medio", "Alto", "Alto"]
  ];

  for (let likelihood = 1; likelihood <= 3; likelihood += 1) {
    for (let impact = 1; impact <= 3; impact += 1) {
      const score = likelihood * impact;
      assert.equal(classifyRisk(score), expected[likelihood - 1][impact - 1], `${likelihood} x ${impact} = ${score}`);
    }
  }
});

test("risk score category boundaries are stable", () => {
  assert.equal(classifyRisk(1), "Bajo");
  assert.equal(classifyRisk(2), "Bajo");
  assert.equal(classifyRisk(3), "Medio");
  assert.equal(classifyRisk(4), "Medio");
  assert.equal(classifyRisk(6), "Alto");
  assert.equal(classifyRisk(9), "Alto");
});
