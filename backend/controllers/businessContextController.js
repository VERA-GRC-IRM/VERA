const service = require("../services/businessContextService");

const list = async (req, res) => res.json({ records: await service.listForUser(req.user) });
const owners = async (req, res) => res.json({ owners: await service.listOwnersForUser(req.user) });
const revisions = async (req, res) => {
  try { res.json({ records: await service.revisionsForUser(req.user, req.params.id) }); }
  catch (error) {
    if ([400, 404].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};
const create = async (req, res) => {
  try { res.status(201).json({ record: await service.createForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};
const publishRevision = async (req, res) => {
  try { res.status(201).json({ record: await service.publishRevisionForUser(req.user, req.params.id, req.body) }); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = { list, owners, revisions, create, publishRevision };
