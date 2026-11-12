const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RECORD_CREATE_ROLES } = require("../config/roles");

const {
  listEvidence,
  createEvidence,
  uploadEvidence,
  downloadEvidence,
  readEvidenceContent,
  askEvidence,
  indexImageEvidence
} = require("../controllers/evidenceController");
const { rateLimit } = require("express-rate-limit");
const resumable = require("../services/resumableEvidenceService");
const uploadResult = (action, status = 200) => async (req, res, next) => {
  try { res.status(status).set("Cache-Control", "no-store").json(await action(req)); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};

router.get("/uploads/cleanup", uploadResult((req) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    const error = new Error("No autorizado."); error.status = 401; throw error;
  }
  return resumable.cleanupExpired();
}));

router.post("/uploads", verifyToken, allowRoles(...RECORD_CREATE_ROLES),
  uploadResult((req) => resumable.start(req.user, req.body), 201));
router.get("/uploads/:id", verifyToken,
  uploadResult((req) => resumable.status(req.user, req.params.id)));
router.put("/uploads/:id/parts/:index", verifyToken, allowRoles(...RECORD_CREATE_ROLES),
  express.raw({ type: () => true, limit: "256kb" }),
  uploadResult((req) => resumable.putPart(req.user, req.params.id, req.params.index, req.body)));
router.post("/uploads/:id/finish", verifyToken, allowRoles(...RECORD_CREATE_ROLES),
  uploadResult((req) => resumable.complete(req.user, req.params.id)));

// Consultar y descargar: Director incluido.
router.get("/", verifyToken, listEvidence);
router.get("/:id/download", verifyToken, downloadEvidence);
router.get("/:id/content", verifyToken, readEvidenceContent);
router.post("/:id/ask", verifyToken, rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }), askEvidence);
router.post("/:id/index-image", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
  standardHeaders: "draft-8", legacyHeaders: false }), verifyToken,
rateLimit({ windowMs: 15 * 60 * 1000, limit: 3,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }),
allowRoles(...RECORD_CREATE_ROLES), indexImageEvidence);

// Crear o subir: Director excluido.
router.post(
  "/",
  verifyToken,
  allowRoles(...RECORD_CREATE_ROLES),
  createEvidence
);

router.post(
  "/upload",
  verifyToken,
  allowRoles(...RECORD_CREATE_ROLES),
  express.raw({ type: () => true, limit: "3mb" }),
  uploadEvidence
);

module.exports = router;
