const risks = [];
const { LEGACY_RISK_METHOD_ID, UNSPECIFIED_STAGE, presentRiskMethod } = require("../config/riskMethods");

const clone = (risk) => presentRiskMethod({
  ...risk,
  ...(risk.templateReference ? { templateReference: { ...risk.templateReference } } : {}),
  ...(risk.businessContextReferences ? { businessContextReferences: risk.businessContextReferences.map((reference) => ({ ...reference })) } : {}),
  createdBy: risk.createdBy ? { ...risk.createdBy } : null,
  evaluations: risk.evaluations.map((item) => ({
    ...item,
    assessedBy: item.assessedBy ? { ...item.assessedBy } : null
  })),
  responseDecisions: (risk.responseDecisions || []).map((item) => ({
    ...item, proposedBy: item.proposedBy ? { ...item.proposedBy } : null
  }))
});

const getAll = () => risks.map(clone);
const findMutableById = (id) => risks.find((item) => item.id === id) || null;
const findById = (id) => {
  const risk = findMutableById(id);
  return risk ? clone(risk) : null;
};
const normalize = (value) => String(value ?? "").trim().toLowerCase();

const findDuplicate = ({ title, area, orgUnitId }, excludeId = null) => risks.find((risk) =>
  risk.id !== excludeId && (risk.orgUnitId || null) === (orgUnitId || null) &&
  normalize(risk.title) === normalize(title) && normalize(risk.area) === normalize(area)
) || null;

const nextId = () => {
  const max = risks.reduce((highest, risk) => {
    const sequence = Number(risk.id.replace("RSK-", ""));
    return Number.isNaN(sequence) ? highest : Math.max(highest, sequence);
  }, 0);
  return `RSK-${String(max + 1).padStart(3, "0")}`;
};

const create = (data) => {
  const assessedAt = new Date().toISOString();
  const methodId = data.methodId || LEGACY_RISK_METHOD_ID;
  const assessmentStage = data.assessmentStage || UNSPECIFIED_STAGE;
  const risk = {
    ...data,
    methodId,
    assessmentStage,
    id: nextId(),
    status: "OPEN",
    createdAt: assessedAt,
    updatedAt: null,
    createdBy: { ...data.createdBy },
    evaluations: [{
      version: 1,
      likelihood: data.likelihood,
      impact: data.impact,
      score: data.score,
      level: data.level,
      note: data.note,
      methodId,
      assessmentStage,
      assessedAt,
      assessedBy: { ...data.createdBy }
    }]
  };
  delete risk.assessmentNote;
  risks.unshift(risk);
  return clone(risk);
};

const update = (id, data) => {
  const risk = findMutableById(id);
  if (!risk) return null;
  Object.assign(risk, data, { updatedAt: new Date().toISOString() });
  return clone(risk);
};

const evaluate = (id, { likelihood, impact, score, level, note, methodId = LEGACY_RISK_METHOD_ID,
  assessmentStage = UNSPECIFIED_STAGE, assessedBy }) => {
  const risk = findMutableById(id);
  if (!risk) return null;
  const evaluation = {
    version: risk.evaluations.length + 1,
    likelihood,
    impact,
    score,
    level,
    note,
    methodId,
    assessmentStage,
    assessedAt: new Date().toISOString(),
    assessedBy: { ...assessedBy }
  };
  Object.assign(risk, { likelihood, impact, score, level, methodId, assessmentStage,
    updatedAt: evaluation.assessedAt });
  risk.evaluations.push(evaluation);
  return clone(risk);
};

const recordResponse = (id, proposal, expectedRevision) => {
  const risk = findMutableById(id);
  if (!risk) return null;
  const decisions = risk.responseDecisions || [];
  if (decisions.length !== expectedRevision) {
    throw Object.assign(new Error("La respuesta cambió. Actualiza el riesgo antes de guardar."), { status: 409 });
  }
  risk.responseDecisions = [...decisions, proposal];
  risk.updatedAt = proposal.proposedAt;
  return clone(risk);
};

const memoryRepository = { getAll, findById, findDuplicate, create, update, evaluate, recordResponse };
module.exports = process.env.VERA_RISK_CONTROL_STORE === "supabase"
  ? require("./supabaseRiskRepository")
  : memoryRepository;
