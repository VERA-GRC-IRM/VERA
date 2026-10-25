const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RISK_CONTROL_MANAGE_ROLES, ROLES } = require("../config/roles");
const { listRisks, listOwners, createRisk, updateRisk, evaluateRisk, proposeResponse } = require("../controllers/riskController");
const { LEGACY_RISK_METHOD } = require("../config/riskMethods");
const { previewQualitativeMethod } = require("../services/riskMethodPreviewService");
const methodCatalog = require("../services/riskMethodCatalogService");

const catalog = (operation, status = 200) => async (req, res, next) => {
  try { return res.status(status).json(await operation(req)); }
  catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
};

router.get("/", verifyToken, listRisks);
router.get("/methods", verifyToken, (_req, res) => res.json({ methods: [LEGACY_RISK_METHOD] }));
router.get("/methods/drafts", verifyToken, allowRoles(ROLES.SUPER_ADMIN),
  catalog(async (req) => ({ methods: await methodCatalog.listDraftMethods(req.user) })));
router.get("/methods/drafts/:id/revisions", verifyToken, allowRoles(ROLES.SUPER_ADMIN),
  catalog(async (req) => ({ revisions: await methodCatalog.listDraftRevisions(req.user, req.params.id) })));
router.post("/methods/drafts", verifyToken, allowRoles(ROLES.SUPER_ADMIN),
  catalog(async (req) => ({ method: await methodCatalog.saveDraftMethod(req.user, req.body) }), 201));
router.post("/methods/drafts/:id/revisions", verifyToken, allowRoles(ROLES.SUPER_ADMIN),
  catalog(async (req) => ({ method: await methodCatalog.saveDraftMethod(req.user, req.body, req.params.id) }), 201));
router.post("/methods/preview", verifyToken, allowRoles(ROLES.SUPER_ADMIN), (req, res) => {
  try { return res.json({ preview: previewQualitativeMethod(req.body) }); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    throw error;
  }
});
router.get("/owners", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), listOwners);
router.post("/", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), createRisk);
router.put("/:id", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateRisk);
router.post("/:id/evaluate", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), evaluateRisk);
router.post("/:id/response", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), proposeResponse);

module.exports = router;
