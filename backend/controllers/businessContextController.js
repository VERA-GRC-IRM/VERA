const service = require("../services/businessContextService");

const list = async (req, res) => res.json({ records: await service.listForUser(req.user) });
const create = async (req, res) => {
  try { res.status(201).json({ record: await service.createForUser(req.user, req.body) }); }
  catch (error) {
    if ([400, 403, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = { list, create };
