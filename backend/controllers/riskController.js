const riskRepository = require("../repositories/riskRepository");
const { evaluateRiskForUser } = require("../services/riskEvaluationService");
const { activeUsers, createRiskForUser } = require("../services/riskCreationService");
const { updateCoreForUser } = require("../services/recordEditService");
const { normalizeArea } = require("../utils/normalizeArea");
const { filterByVisibleScope } = require("../services/recordScopeVisibility");

const text = (value) => String(value ?? "").trim();
const listRisks = async (req, res) => {
  const { level, search, area } = req.query;
  const needle = text(search).toLowerCase();
  let risks = await filterByVisibleScope(req.user, await riskRepository.getAll());
  if (req.user.role === "AUDITOR") risks = risks.filter((risk) => risk.ownerId === req.user.id);
  if (["Bajo", "Medio", "Alto"].includes(level)) risks = risks.filter((risk) => risk.level === level);
  if (area) risks = risks.filter((risk) => normalizeArea(risk.area) === normalizeArea(area));
  if (needle) risks = risks.filter((risk) => `${risk.title} ${risk.description} ${risk.area} ${risk.ownerName}`.toLowerCase().includes(needle));
  res.json({ risks });
};

const listOwners = async (req, res) => {
  res.json({ owners: (await activeUsers()).map(({ id, name, username, role }) => ({ id, name, username, role })) });
};

const createRisk = async (req, res) => {
  try { return res.status(201).json({ risk: await createRiskForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const updateRisk = async (req, res) => {
  try { return res.json({ risk: await updateCoreForUser(req.user, "RISK", req.params.id, req.body) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const evaluateRisk = async (req, res) => {
  try { res.json({ risk: await evaluateRiskForUser(req.user, req.params.id, req.body) }); }
  catch (error) { res.status(error.status || 502).json({ message: error.status ? error.message : "No se pudo evaluar el riesgo." }); }
};

module.exports = { listRisks, listOwners, createRisk, updateRisk, evaluateRisk };
