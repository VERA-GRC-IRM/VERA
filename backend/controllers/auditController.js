const { query } = require("../services/auditLogger");
const planningRepository = require("../repositories/planningRepository");
const { ROLES } = require("../config/roles");
const { filterByVisibleScope } = require("../services/recordScopeVisibility");

// GET /api/audit?action=&actor=&from=&to=&limit=   (solo Super Admin)
const listAudit = async (req, res) => {
  const { action, actor, from, to, entityId, limit } = req.query;
  res.json({ entries: await query({ action, actor, from, to, entityId, limit }) });
};

const listRecentAuditActivity = async (req, res) => {
  const audits = await filterByVisibleScope(req.user, await planningRepository.getAll());
  const visibleAudits = new Map(
    audits
      .filter((audit) => req.user.role !== ROLES.AUDITOR || audit.responsibleId === req.user.id)
      .map((audit) => [audit.id, audit])
  );
  const entries = await query({ limit: 1000 });
  const recent = entries
    .map((entry) => {
      const details = entry.details || {};
      const auditId = details.proposalId || details.auditId ||
        (details.entityType === "AUDIT" ? details.entityId : null);
      const audit = visibleAudits.get(auditId);
      return audit ? {
        ...entry,
        audit: { id: audit.id, title: audit.title, status: audit.status }
      } : null;
    })
    .filter(Boolean)
    .slice(0, 8);

  res.json({ entries: recent });
};

module.exports = { listAudit, listRecentAuditActivity };
