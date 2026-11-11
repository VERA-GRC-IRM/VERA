const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { CONTROL_MANAGE_ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { listControls, createControl, updateControl, updateControlOfflineDescription,
  evaluateControl } = require("../controllers/controlController");

router.get("/", verifyToken, listControls);
router.post("/", verifyToken, allowRoles(...CONTROL_MANAGE_ROLES), createControl);
router.put("/:id", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateControl);
router.patch("/:id/offline-description", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateControlOfflineDescription);
router.post("/:id/evaluate", verifyToken, allowRoles(...CONTROL_MANAGE_ROLES), evaluateControl);

module.exports = router;
