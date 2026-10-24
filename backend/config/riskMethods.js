// Historical VERA matrix. Its factors are ordinal categories, not monetary values.
const LEGACY_RISK_METHOD_ID = "legacy-3x3-v1";
const UNSPECIFIED_STAGE = "UNSPECIFIED";

const LEGACY_RISK_METHOD = Object.freeze({
  id: LEGACY_RISK_METHOD_ID,
  name: "Matriz histórica VERA 3×3",
  type: "QUALITATIVE",
  stage: UNSPECIFIED_STAGE,
  likelihood: [1, 2, 3],
  impact: [1, 2, 3],
  formula: "likelihood * impact",
  levels: [
    { from: 1, to: 2, level: "Bajo" },
    { from: 3, to: 4, level: "Medio" },
    { from: 5, to: 9, level: "Alto" }
  ],
  approvedEnterprisePolicy: false
});

const methodIdFor = (assessment) => assessment?.methodId || LEGACY_RISK_METHOD_ID;
const stageFor = (assessment) => assessment?.assessmentStage || UNSPECIFIED_STAGE;
const presentRiskMethod = (risk) => risk ? {
  ...risk,
  methodId: methodIdFor(risk),
  assessmentStage: stageFor(risk),
  evaluations: (risk.evaluations || []).map((item) => ({
    ...item, methodId: methodIdFor(item), assessmentStage: stageFor(item)
  }))
} : null;

module.exports = {
  LEGACY_RISK_METHOD_ID, UNSPECIFIED_STAGE, LEGACY_RISK_METHOD,
  methodIdFor, stageFor, presentRiskMethod
};
