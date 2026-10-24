const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/riskLibraryController");

const router = express.Router();
router.use(verifyToken);
router.get("/", controller.listLibrary);
router.get("/templates/:id/revisions", controller.listRevisions);
router.post("/categories", allowRoles(ROLES.SUPER_ADMIN), controller.createCategory);
router.post("/templates", allowRoles(ROLES.SUPER_ADMIN), controller.publishTemplate);
router.post("/templates/:id/revisions", allowRoles(ROLES.SUPER_ADMIN), controller.reviseTemplate);

module.exports = router;
