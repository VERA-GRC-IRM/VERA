const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../config/roles");
const { listOrgUnits, listAvailableOrgUnits, createOrgUnit } = require("../controllers/orgUnitController");
const { listGrants, createGrant, revokeGrant } = require("../controllers/orgGrantController");

const router = express.Router();
router.use(verifyToken);
router.get("/available", listAvailableOrgUnits);
router.use(allowRoles(ROLES.SUPER_ADMIN));
router.get("/", listOrgUnits);
router.post("/", createOrgUnit);
router.get("/:unitId/grants", listGrants);
router.post("/:unitId/grants", createGrant);
router.post("/grants/:id/revoke", revokeGrant);

module.exports = router;
