const findingRepository = require("../repositories/findingRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const { projectVisibleRiskRelations } = require("../services/recordScopeVisibility");
const { createFindingForUser } = require("../services/findingCreationService");
const { closeFindingForUser } = require("../services/findingClosureService");

const listFindings = async (req, res) => {
  const controlId = String(req.query.controlId ?? "").trim();
  const [risks, controls, findings] = await Promise.all([
    riskRepository.getAll(), controlRepository.getAll(), findingRepository.getAll()
  ]);
  const visible = (await projectVisibleRiskRelations(req.user, risks, controls, findings)).findings
    .filter((finding) => !controlId || finding.controlId === controlId);
  res.json({ findings: visible });
};

const createFinding = async (req, res) => {
  try { return res.status(201).json({ finding: await createFindingForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const closeFinding = async (req, res) => {
  try { return res.json({ finding: await closeFindingForUser(req.user,
    req.params.id, req.body?.note, req.body?.version) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = { listFindings, createFinding, closeFinding };
