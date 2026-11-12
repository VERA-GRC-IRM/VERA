const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const jobs = require("../repositories/reportJobRepository");
const service = require("../services/reportJobService");

const router = express.Router();
router.use((req, res, next) => process.env.VERA_JOBS_ENABLED === "true"
  ? next() : res.status(404).json({ message: "Centro de trabajos no disponible." }));
const handle = (handler) => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) { if (error.jobError) return res.status(error.status).json({ message: error.message }); next(error); }
};
router.get("/worker", handle(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.sendStatus(401);
  res.set("Cache-Control", "no-store");
  res.json(await service.runWorker());
}));
router.use(verifyToken);
router.use((req, res, next) => req.user.roleTour
  ? res.status(403).json({ message: "El recorrido de rol no inicia trabajos." }) : next());
router.get("/", handle(async (req, res) => {
  res.set("Cache-Control", "no-store"); res.json({ jobs: await jobs.list(req.user) });
}));
router.post("/report", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(202).json({ job: await service.enqueue(req.user, req.body) });
}));
router.get("/:id", handle(async (req, res) => {
  const job = await jobs.get(req.user, req.params.id);
  if (!job) return res.sendStatus(404);
  res.set("Cache-Control", "no-store"); res.json({ job });
}));
router.delete("/:id", handle(async (req, res) => {
  const job = await jobs.cancel(req.user, req.params.id);
  if (!job) return res.sendStatus(404);
  res.set("Cache-Control", "no-store"); res.json({ job });
}));
router.get("/:id/download", handle(async (req, res) => {
  const { bytes, format } = await service.download(req.user, req.params.id);
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="vera-reporte-${req.params.id}.${format}"`);
  res.send(bytes);
}));
module.exports = router;
