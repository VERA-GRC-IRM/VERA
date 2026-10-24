const controlRepository = require("../repositories/controlRepository");
const riskRepository = require("../repositories/riskRepository");
const { projectVisibleRiskRelations } = require("../services/recordScopeVisibility");
const { withResult, evaluateControlForUser } = require("../services/controlEvaluationService");
const { createControlForUser } = require("../services/controlCreationService");
const { updateCoreForUser } = require("../services/recordEditService");

const visibleControls = async (req) => {
  const [risks, controls] = await Promise.all([riskRepository.getAll(), controlRepository.getAll()]);
  return (await projectVisibleRiskRelations(req.user, risks, controls)).controls;
};

const listControls = async (req, res) => res.json({ controls: (await visibleControls(req)).map(withResult) });

const createControl = async (req, res) => {
  try { return res.status(201).json({ control: await createControlForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const updateControl = async (req, res) => {
  try { return res.json({ control: withResult(await updateCoreForUser(req.user, "CONTROL", req.params.id, req.body)) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const evaluateControl = async (req, res) => {
  try { return res.json({ control: await evaluateControlForUser(req.user, req.params.id, req.body) }); }
  catch (error) { return res.status(error.status || 502).json({ message: error.status ? error.message : "No se pudo evaluar el control." }); }
};

module.exports = { listControls, createControl, updateControl, evaluateControl };
