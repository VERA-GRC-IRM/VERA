const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { listRisks, listOwners, createRisk, updateRisk, evaluateRisk } = require("../controllers/riskController");
const { LEGACY_RISK_METHOD } = require("../config/riskMethods");

router.get("/", verifyToken, listRisks);
router.get("/methods", verifyToken, (_req, res) => res.json({ methods: [LEGACY_RISK_METHOD] }));
router.get("/owners", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), listOwners);
router.post("/", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), createRisk);
router.put("/:id", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateRisk);
router.post("/:id/evaluate", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), evaluateRisk);

module.exports = router;
