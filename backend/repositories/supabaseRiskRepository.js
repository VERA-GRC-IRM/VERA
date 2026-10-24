const { randomUUID } = require("node:crypto");
const { createStore } = require("./supabaseDocumentStore");
const { LEGACY_RISK_METHOD_ID, UNSPECIFIED_STAGE, presentRiskMethod } = require("../config/riskMethods");

const store = createStore("vera_risks");
const normalize = (value) => String(value ?? "").trim().toLowerCase();

const findDuplicate = async ({ title, area, orgUnitId }, excludeId = null) =>
  (await store.getAll()).find((risk) => risk.id !== excludeId &&
    (risk.orgUnitId || null) === (orgUnitId || null) &&
    normalize(risk.title) === normalize(title) && normalize(risk.area) === normalize(area)) || null;

const create = async (data) => {
  const assessedAt = new Date().toISOString();
  const methodId = data.methodId || LEGACY_RISK_METHOD_ID;
  const assessmentStage = data.assessmentStage || UNSPECIFIED_STAGE;
  const risk = {
    ...data,
    methodId,
    assessmentStage,
    id: `RSK-${randomUUID()}`,
    status: "OPEN",
    createdAt: assessedAt,
    updatedAt: null,
    createdBy: { ...data.createdBy },
    evaluations: [{
      version: 1, likelihood: data.likelihood, impact: data.impact,
      score: data.score, level: data.level, note: data.note, methodId, assessmentStage,
      assessedAt, assessedBy: { ...data.createdBy }
    }]
  };
  delete risk.assessmentNote;
  return presentRiskMethod(await store.create(risk));
};

const update = async (id, data, expectedVersion) =>
  presentRiskMethod(await store.mutate(id, data, expectedVersion));
const evaluate = async (id, { likelihood, impact, score, level, note,
  methodId = LEGACY_RISK_METHOD_ID, assessmentStage = UNSPECIFIED_STAGE, assessedBy }, expectedVersion) => {
  const current = await store.findById(id);
  if (!current) return null;
  const assessedAt = new Date().toISOString();
  const evaluation = {
    version: current.evaluations.length + 1,
    likelihood, impact, score, level, note, methodId, assessmentStage,
    assessedAt, assessedBy: { ...assessedBy }
  };
  return presentRiskMethod(await store.mutate(id, {
    likelihood, impact, score, level, methodId, assessmentStage,
    evaluations: [...current.evaluations, evaluation]
  }, expectedVersion ?? current.storageVersion));
};

module.exports = {
  getAll: async () => (await store.getAll()).map(presentRiskMethod),
  findById: async (id) => presentRiskMethod(await store.findById(id)),
  findDuplicate, create, update, evaluate
};
