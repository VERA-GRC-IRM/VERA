const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RISK_CONTROL_MANAGE_ROLES, CONTROL_WRITE_ROLES } = require("../config/roles");
const { listControls, createControl, updateControl, evaluateControl } = require("../controllers/controlController");

router.get("/", verifyToken, listControls);
router.post("/", verifyToken, allowRoles(...CONTROL_WRITE_ROLES), createControl);
router.put("/:id", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateControl);
router.post("/:id/evaluate", verifyToken, allowRoles(...CONTROL_WRITE_ROLES), evaluateControl);

module.exports = router;
