const { createHash } = require("node:crypto");
const { buildAssistantContext } = require("./assistantContextService");
const evidenceRepository = require("../repositories/evidenceRepository");
const DISPLAY_ONLY_NOTIFICATIONS = new Set(["ACTION_ASSIGNED", "PROPOSAL_DECIDED",
  "PLAN_VALIDATION_REQUESTED", "FINDING_CREATED", "EVIDENCE_CREATED"]);

// A stored conversation must not outlive the user's present data scope.
// Hash identifiers, never record content or credentials.
const currentScope = async (user, focus = null) => {
  const { visibleRecords } = await buildAssistantContext(user, "", focus);
  // Preserve the legacy scope signature when new display-only avisos appear or resolve.
  // Each underlying record is still authorized afresh by buildAssistantContext.
  const visible = Object.fromEntries(Object.entries(visibleRecords).map(([type, items]) =>
    [type, items.filter((item) => type !== "pending" || !DISPLAY_ONLY_NOTIFICATIONS.has(item.type))
      .map((item) => String(item.id)).sort()]));
  const linked = {
    AUDIT: new Set(visible.audits), RISK: new Set(visible.risks), CONTROL: new Set(visible.controls)
  };
  visible.evidence = (await evidenceRepository.getAll())
    .filter((item) => linked[item.entityType]?.has(String(item.entityId)))
    .map((item) => String(item.id)).sort();
  return createHash("sha256").update(JSON.stringify({ role: user.role, visible })).digest("hex");
};

module.exports = { currentScope };
