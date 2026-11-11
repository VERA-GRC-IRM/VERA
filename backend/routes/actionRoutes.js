const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { RECORD_CREATE_ROLES, PLANNING_APPROVE_ROLES } = require("../config/roles");
const actions = require("../services/actionService");

const router = express.Router();
router.use(verifyToken);
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/", async (req, res) => res.json({ actions: await actions.listActions(req.user, req.query) }));
router.get("/sources", async (req, res) => res.json({ sources: await actions.listSources(req.user) }));
router.get("/assignees", async (req, res) => res.json({ assignees: await actions.listAssignees(
  req.user, String(req.query.sourceType ?? "").trim(), String(req.query.sourceId ?? "").trim()
) }));
router.get("/for-audit/:auditId", async (req, res) => res.json(await actions.listActionsForAudit(req.user, req.params.auditId)));
router.get("/:id/evidence-options", async (req, res) => res.json({ evidence: await actions.listPlanEvidence(req.user, req.params.id) }));
router.get("/:id", async (req, res) => res.json({ action: await actions.getAction(req.user, req.params.id) }));
router.post("/", allowRoles(...RECORD_CREATE_ROLES), async (req, res) =>
  res.status(201).json({ action: await actions.createAction(req.user, req.body || {}) }));
router.patch("/:id/status", allowRoles(...RECORD_CREATE_ROLES), async (req, res) =>
  res.json({ action: await actions.changeStatus(req.user, req.params.id, req.body || {}) }));
router.patch("/:id/assignee", allowRoles(...PLANNING_APPROVE_ROLES), async (req, res) =>
  res.json({ action: await actions.reassign(req.user, req.params.id, req.body || {}) }));
router.patch("/:id/progress", allowRoles(...RECORD_CREATE_ROLES), async (req, res) =>
  res.json({ action: await actions.updateProgress(req.user, req.params.id, req.body || {},
    { operationId: req.get("Idempotency-Key") }) }));
router.post("/:id/comments", allowRoles(...RECORD_CREATE_ROLES), async (req, res) =>
  res.json({ action: await actions.addPlanComment(req.user, req.params.id, req.body || {},
    { operationId: req.get("Idempotency-Key") }) }));
router.post("/:id/validation-request", allowRoles(...RECORD_CREATE_ROLES), async (req, res) =>
  res.json({ action: await actions.requestValidation(req.user, req.params.id, req.body || {}) }));

module.exports = router;
