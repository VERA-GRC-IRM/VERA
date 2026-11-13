const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { CONTROL_MANAGE_ROLES, RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const {
  listFindings,
  createFinding,
  updateFinding,
  closeFinding,
  reviewFindingClosure
} = require("../controllers/findingController");

const router = express.Router();

router.get("/", verifyToken, listFindings);

router.post(
  "/",
  verifyToken,
  allowRoles(...CONTROL_MANAGE_ROLES),
  createFinding
);

router.patch("/:id", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), updateFinding);
router.patch("/:id/close", verifyToken, allowRoles(...CONTROL_MANAGE_ROLES), closeFinding);
router.post("/:id/closure-decision", verifyToken, allowRoles(...RISK_CONTROL_MANAGE_ROLES), reviewFindingClosure);

module.exports = router;
