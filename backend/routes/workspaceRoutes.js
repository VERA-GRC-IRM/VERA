const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const workspace = require("../repositories/workspaceRepository");
const workspaceService = require("../services/workspaceService");

const router = express.Router();
router.use((req, res, next) => process.env.VERA_WORKSPACE_SYNC_ENABLED === "true"
  ? next() : res.status(404).json({ message: "Sincronización no disponible." }));
router.use(verifyToken);
router.use((req, res, next) => req.user.roleTour
  ? res.status(403).json({ message: "El recorrido de rol no guarda un espacio personal." }) : next());

router.get("/", async (req, res, next) => {
  try { res.set("Cache-Control", "no-store"); res.json(await workspaceService.getForUser(req.user)); }
  catch (error) {
    if (error instanceof workspace.WorkspaceError) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});
router.put("/", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await workspaceService.saveForUser(req.user, req.body.expectedVersion, req.body.payload));
  } catch (error) {
    if (error instanceof workspace.WorkspaceError) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

module.exports = router;
