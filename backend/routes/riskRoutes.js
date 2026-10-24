const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RISK_CONTROL_MANAGE_ROLES, ROLES } = require("../config/roles");
const { listRisks, listOwners, createRisk, updateRisk, evaluateRisk } = require("../controllers/riskController");
const { LEGACY_RISK_METHOD } = require("../config/riskMethods");
const { previewQualitativeMethod } = require("../services/riskMethodPreviewService");

router.get("/", verifyToken, listRisks);
router.get("/methods", verifyToken, (_req, res) => res.json({ methods: [LEGACY_RISK_METHOD] }));
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

module.exports = router;
