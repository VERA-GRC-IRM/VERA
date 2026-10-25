const riskRepository = require("../repositories/riskRepository");
const userRepository = require("../repositories/userRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/accountRules");
const { canViewRecordScope } = require("./recordScopeVisibility");
const { assertWritableRecordScope, assertWritableRiskAuditLink } = require("./recordWriteScopeService");
const { logActivity } = require("./auditLogger");

const STRATEGIES = Object.freeze(["AVOID", "REDUCE", "TRANSFER", "ACCEPT"]);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const field = (value, label, min, max) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw fail(`${label}: usa entre ${min} y ${max} caracteres.`);
  }
  return value.trim();
};
const dueDateFor = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value ||
      value < new Date().toISOString().slice(0, 10)) {
    throw fail("Indica una fecha de revisión vigente en formato AAAA-MM-DD.");
  }
  return value;
};

const proposeResponseForUser = async (actor, id, input) => {
  const currentActor = await userRepository.findById(actor.id);
  if (currentActor?.status !== USER_STATUS.ACTIVE || currentActor.role !== actor.role) {
    throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RISK_CONTROL_MANAGE_ROLES.includes(actor.role)) throw fail("Tu rol no puede definir respuestas.", 403);
  const risk = await riskRepository.findById(id);
  if (!risk) throw fail("Riesgo no encontrado.", 404);
  await assertWritableRecordScope(actor, risk);
  await assertWritableRiskAuditLink(actor, risk);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("Envía una respuesta válida.");
  if (!STRATEGIES.includes(input.strategy)) throw fail("Selecciona una estrategia válida.");
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      expectedRevision !== (risk.responseDecisions || []).length) {
    throw fail("La respuesta cambió. Actualiza el riesgo antes de guardar.", 409);
  }
  const ownerId = Number(input.ownerId);
  const owner = await userRepository.findById(ownerId);
  if (!owner || owner.status !== USER_STATUS.ACTIVE ||
      (owner.role === "AUDITOR" && owner.id !== risk.ownerId) ||
      !await canViewRecordScope(owner, risk)) {
    throw fail("Selecciona un responsable activo con acceso al riesgo.");
  }
  const proposal = {
    revision: expectedRevision + 1,
    strategy: input.strategy,
    status: "PROPOSED",
    rationale: field(input.rationale, "Motivo", 20, 1000),
    actions: field(input.actions, "Acciones o condiciones", 10, 2000),
    ownerId: owner.id,
    ownerName: owner.name,
    reviewDate: dueDateFor(input.reviewDate),
    proposedAt: new Date().toISOString(),
    proposedBy: { id: actor.id, name: actor.username }
  };
  const updated = await riskRepository.recordResponse(id, proposal, expectedRevision, risk.storageVersion);
  if (!updated) throw fail("El riesgo dejó de estar disponible.", 409);
  await logActivity({ actor, action: "RISK_RESPONSE_PROPOSED",
    details: { riskId: id, strategy: proposal.strategy, revision: proposal.revision, ownerId: owner.id } });
  return updated;
};

module.exports = { STRATEGIES, proposeResponseForUser };
