const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { AUDIT_PROPOSAL_CREATE_ROLES, AUDIT_PROPOSAL_DELETE_ROLES, PLANNING_APPROVE_ROLES } = require("../config/roles");
const {
  listProposals,
  searchPlanningAudits,
  listActiveAudits,
  listAuditors,
  createProposal,
  updateProposal,
  approveProposal,
  startAudit,
  closeAudit,
  updateWorkflowStep,
  rejectProposal,
  deleteProposal,
  editAudit
} = require("../controllers/planningController");
const { getHistory, addComment } = require("../controllers/planningHistoryController");
const { buildAuditContext } = require("../services/auditContextService");
const { parseAuditFilters } = require("../services/auditSearch");
const { buildPortfolioReport, reportToCsv } = require("../services/portfolioReportService");
const { reportToPdf } = require("../services/portfolioPdfService");

// Todos los usuarios con sesión pueden consultar el tablero.
router.get("/", verifyToken, listProposals);
router.get("/search", verifyToken, searchPlanningAudits);
router.get("/report", verifyToken, async (req, res, next) => {
  try {
    const { filters, error } = parseAuditFilters(req.query);
    if (error) return res.status(400).json({ message: error });
    if (req.query.format !== undefined && !["csv", "pdf", "xlsx"].includes(req.query.format)) {
      return res.status(400).json({ message: "El formato no es válido." });
    }
    const report = await buildPortfolioReport(req.user, filters);
    res.set("Cache-Control", "no-store");
    res.set("Vary", "Authorization");
    if (req.query.format === "csv") {
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="vera-reporte-portafolio.csv"');
      return res.send(reportToCsv(report));
    }
    if (req.query.format === "pdf") {
      const pdf = await reportToPdf(report);
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", 'attachment; filename="vera-reporte-portafolio.pdf"');
      return res.send(pdf);
    }
    if (req.query.format === "xlsx") {
      const { reportToXlsx } = require("../services/portfolioXlsxService");
      const workbook = await reportToXlsx(report);
      res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.set("Content-Disposition", 'attachment; filename="vera-reporte-portafolio.xlsx"');
      return res.send(Buffer.from(workbook));
    }
    return res.json(report);
  } catch (error) {
    if (error.status === 403) return res.status(403).json({ message: error.message });
    return next(error);
  }
});
router.get("/active", verifyToken, listActiveAudits);
router.get("/auditors", verifyToken, allowRoles(...AUDIT_PROPOSAL_CREATE_ROLES), listAuditors);
router.get("/:id/context", verifyToken, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await buildAuditContext(req.user, req.params.id));
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});
router.patch("/:id/workflow-step", verifyToken, updateWorkflowStep);
router.get("/:id/history", verifyToken, getHistory);
const { RECORD_CREATE_ROLES } = require("../config/roles");

// Registrar comentarios: Director excluido.
router.post(
  "/:id/comments",
  verifyToken,
  allowRoles(...RECORD_CREATE_ROLES),
  addComment
);

router.post("/", verifyToken, allowRoles(...AUDIT_PROPOSAL_CREATE_ROLES), createProposal);
router.put("/:id", verifyToken, allowRoles(...AUDIT_PROPOSAL_CREATE_ROLES), updateProposal);
router.delete("/:id", verifyToken, allowRoles(...AUDIT_PROPOSAL_DELETE_ROLES), deleteProposal);
router.patch("/:id/details", verifyToken, allowRoles(...PLANNING_APPROVE_ROLES), editAudit);
router.post("/:id/approve", verifyToken, allowRoles(...PLANNING_APPROVE_ROLES), approveProposal);
router.post("/:id/start", verifyToken, allowRoles(...PLANNING_APPROVE_ROLES), startAudit);
router.post("/:id/close", verifyToken, allowRoles(...PLANNING_APPROVE_ROLES), closeAudit);
router.post("/:id/reject", verifyToken, allowRoles(...PLANNING_APPROVE_ROLES), rejectProposal);

module.exports = router;
