const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RECORD_CREATE_ROLES, USER_ADMIN_ROLES } = require("../config/roles");
const {
  listFindings,
  createFinding,
  closeFinding,
  decideFindingClosure
} = require("../controllers/findingController");

const router = express.Router();

router.get("/", verifyToken, listFindings);

router.post(
  "/",
  verifyToken,
  allowRoles(...RECORD_CREATE_ROLES),
  createFinding
);

router.patch("/:id/close", verifyToken, allowRoles(...RECORD_CREATE_ROLES), closeFinding);
router.post("/:id/closure-decision", verifyToken, allowRoles(...USER_ADMIN_ROLES), decideFindingClosure);

module.exports = router;
