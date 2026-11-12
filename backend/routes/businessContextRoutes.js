const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/businessContextController");
const { graphForUser } = require("../services/businessGraphService");

const router = express.Router();
router.use(verifyToken);
router.get("/", controller.list);
router.get("/graph", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Authorization");
  res.json(await graphForUser(req.user));
});
router.get("/owners", allowRoles(ROLES.SUPER_ADMIN), controller.owners);
router.post("/", allowRoles(ROLES.SUPER_ADMIN), controller.create);
router.get("/:id/revisions", controller.revisions);
router.post("/:id/revisions", allowRoles(ROLES.SUPER_ADMIN), controller.publishRevision);

module.exports = router;
