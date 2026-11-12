const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/businessContextController");
const { graphForUser } = require("../services/businessGraphService");
const businessImport = require("../services/businessImportService");

const router = express.Router();
router.use(verifyToken);
router.get("/", controller.list);
router.get("/graph", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Authorization");
  res.json(await graphForUser(req.user));
});
router.get("/owners", allowRoles(ROLES.SUPER_ADMIN), controller.owners);
const importAction = (operation) => async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const result = await operation(req.user, req.body);
    return result?.status ? res.status(result.status).json(result.result) : res.json(result);
  } catch (error) {
    if ([400, 403, 409, 413].includes(error.status)) {
      return res.status(error.status).json({ message: error.message, ...(error.preview ? { preview: error.preview } : {}) });
    }
    return next(error);
  }
};
router.post("/import/preview", allowRoles(ROLES.SUPER_ADMIN), importAction(businessImport.previewForUser));
router.post("/import/apply", allowRoles(ROLES.SUPER_ADMIN), importAction(businessImport.applyForUser));
router.post("/", allowRoles(ROLES.SUPER_ADMIN), controller.create);
router.get("/:id/revisions", controller.revisions);
router.post("/:id/revisions", allowRoles(ROLES.SUPER_ADMIN), controller.publishRevision);

module.exports = router;
