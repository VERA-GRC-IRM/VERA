const { randomUUID } = require("node:crypto");
const repository = require("../repositories/riskMethodRepository");
const { ROLES } = require("../config/roles");
const { validateMethod } = require("./riskMethodPreviewService");
const { logActivity } = require("./auditLogger");

const errorFor = (message, status) => Object.assign(new Error(message), { status });
const requireAdmin = (actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede administrar métodos.", 403);
};
const revisionsOf = async (methodId) => (await repository.getAll())
  .filter((record) => record.methodId === methodId).sort((a, b) => a.revision - b.revision);
const actorFor = (actor) => ({ id: actor.id, username: actor.username });

const listDraftMethods = async (actor) => {
  requireAdmin(actor);
  const latest = new Map();
  for (const record of await repository.getAll()) {
    if (!latest.has(record.methodId) || latest.get(record.methodId).revision < record.revision) {
      latest.set(record.methodId, record);
    }
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
};
const listDraftRevisions = async (actor, methodId) => {
  requireAdmin(actor);
  const revisions = await revisionsOf(methodId);
  if (!revisions.length) throw errorFor("Método no encontrado.", 404);
  return revisions;
};
const saveDraftMethod = async (actor, body, methodId = null) => {
  requireAdmin(actor);
  const definition = validateMethod(body);
  const revisions = methodId ? await revisionsOf(methodId) : [];
  if (methodId && !revisions.length) throw errorFor("Método no encontrado.", 404);
  if (revisions.some((record) => record.version.toLocaleLowerCase() === definition.version.toLocaleLowerCase())) {
    throw errorFor("Usa una versión nueva para conservar el historial.", 409);
  }
  const revisionReason = !methodId ? "Borrador inicial" : String(body.revisionReason ?? "").trim();
  if (methodId && (revisionReason.length < 10 || revisionReason.length > 500)) {
    throw errorFor("Motivo de revisión: usa entre 10 y 500 caracteres.", 400);
  }
  const id = methodId || `RISK-METHOD-${randomUUID()}`;
  const revision = revisions.length + 1;
  const record = await repository.create({ ...definition, id: `${id}:${revision}`, methodId: id,
    revision, revisionReason, status: "DRAFT", approvedEnterprisePolicy: false,
    availableForAssessment: false, createdAt: new Date().toISOString(), createdBy: actorFor(actor) });
  await logActivity({ actor, action: "RISK_METHOD_DRAFT_SAVED",
    details: { methodId: id, revision } });
  return record;
};

module.exports = { listDraftMethods, listDraftRevisions, saveDraftMethod };
