const repository = require("../repositories/orgUnitRepository");
const { createOrgUnitForUser } = require("../services/orgUnitService");
const { availableScopesFor } = require("../services/scopeAccessService");

const listOrgUnits = async (_req, res) => res.json({ units: await repository.getAll() });
const listAvailableOrgUnits = async (req, res) => res.json({ units: await availableScopesFor(req.user) });
const createOrgUnit = async (req, res) => {
  try { res.status(201).json({ unit: await createOrgUnitForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = { listOrgUnits, listAvailableOrgUnits, createOrgUnit };
