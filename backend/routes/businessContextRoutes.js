const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/businessContextController");

const router = express.Router();
router.use(verifyToken);
router.get("/", controller.list);
router.post("/", allowRoles(ROLES.SUPER_ADMIN), controller.create);

module.exports = router;
