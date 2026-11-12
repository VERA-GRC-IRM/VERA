const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const service = require("../services/pushService");

const router = express.Router();
router.use((req, res, next) => process.env.VERA_PUSH_ENABLED === "true"
  ? next() : res.status(404).json({ message: "Avisos push no disponibles." }));
router.use(verifyToken);
router.use((req, res, next) => req.user.roleTour
  ? res.status(403).json({ message: "El recorrido de rol no recibe avisos push." }) : next());
const handle = (action) => async (req, res, next) => {
  try { res.set("Cache-Control", "no-store"); res.json(await action(req)); }
  catch (error) { if (error.pushError) return res.status(error.status).json({ message: error.message }); next(error); }
};
router.get("/config", handle(async () => ({ publicKey: service.config() })));
router.post("/subscription", handle(async (req) => service.subscribe(req.user, req.body)));
router.delete("/subscription", handle(async (req) => service.unsubscribe(req.user, req.body?.endpoint)));
module.exports = router;
