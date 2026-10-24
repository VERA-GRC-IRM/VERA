const service = require("../services/riskLibraryService");
const handle = (operation, successStatus = 200) => async (req, res) => {
  try { return res.status(successStatus).json(await operation(req)); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

module.exports = {
  listLibrary: handle(() => service.listLibrary()),
  listRevisions: handle(async (req) => ({ revisions: await service.listTemplateRevisions(req.params.id) })),
  createCategory: handle(async (req) => ({ category: await service.createCategoryForUser(req.user, req.body) }), 201),
  publishTemplate: handle(async (req) => ({ template: await service.publishTemplateForUser(req.user, req.body) }), 201),
  reviseTemplate: handle(async (req) => ({ template: await service.reviseTemplateForUser(req.user, req.params.id, req.body) }), 201)
};
