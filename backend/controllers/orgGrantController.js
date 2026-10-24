const unitRepository = require("../repositories/orgUnitRepository");
const grantRepository = require("../repositories/orgGrantRepository");
const { createGrantForUser, revokeGrantForUser } = require("../services/orgGrantService");

const listGrants = async (req, res) => {
  const unit = await unitRepository.findById(req.params.unitId);
  if (!unit) return res.status(404).json({ message: "El ámbito no existe." });
  const grants = await grantRepository.listByUnit(unit.id);
  return res.json({ grants });
};
const createGrant = async (req, res) => {
  try { return res.status(201).json({ grant: await createGrantForUser(req.user, req.params.unitId, req.body) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};
const revokeGrant = async (req, res) => {
  try { return res.json({ grant: await revokeGrantForUser(req.user, req.params.id, req.body) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = { listGrants, createGrant, revokeGrant };
