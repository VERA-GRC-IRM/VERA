const { visibleCollectionsForUser } = require("./recordReadAccessService");
const { listForUser: listBusinessContextForUser } = require("./businessContextService");
const evidenceRepository = require("../repositories/evidenceRepository");

const normalize = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const LIMIT = 24;

const searchForUser = async (user, query) => {
  if (typeof query !== "string" || query.trim().length < 2 || query.trim().length > 80) {
    const error = new Error("Escribe entre 2 y 80 caracteres para buscar registros.");
    error.status = 400;
    throw error;
  }
  const needle = normalize(query.trim());
  const [collections, context, evidence] = await Promise.all([
    visibleCollectionsForUser(user), listBusinessContextForUser(user), evidenceRepository.getAll()
  ]);
  const visibleIds = Object.fromEntries(["AUDIT", "RISK", "CONTROL"].map((type) =>
    [type, new Set(collections[type].map((item) => item.id))]));
  const visibleEvidence = evidence.filter((item) => visibleIds[item.entityType]?.has(item.entityId) &&
    normalize(`${item.id} ${item.title} ${item.reference || ""}`).includes(needle)).slice(0, LIMIT);
  const candidates = [
    ...collections.AUDIT.map((item) => ({ type: "AUDIT", id: item.id, title: item.title,
      path: `/buscar-auditorias?auditId=${encodeURIComponent(item.id)}` })),
    ...collections.RISK.map((item) => ({ type: "RISK", id: item.id, title: item.title,
      path: `/riesgos#risk-${encodeURIComponent(item.id)}` })),
    ...collections.CONTROL.map((item) => ({ type: "CONTROL", id: item.id, title: item.title,
      path: `/controles#control-${encodeURIComponent(item.id)}` })),
    ...collections.FINDING.filter((item) => item.auditId).map((item) => ({
      type: "FINDING", id: item.id, title: item.title,
      path: `/auditorias-activas/${encodeURIComponent(item.auditId)}` })),
    ...visibleEvidence.map((item) => ({ type: "EVIDENCE", id: item.id, title: item.title,
      path: `/evidencias#evidence-${encodeURIComponent(item.id)}` })),
    ...context.map((item) => ({ type: item.kind, id: item.contextId, title: item.name,
      code: item.code, path: `/mapa-negocio?context=${encodeURIComponent(item.contextId)}` }))
  ];
  return candidates.map((item) => ({ ...item,
    score: normalize(item.id).startsWith(needle) ? 0 : normalize(item.code).startsWith(needle) ? 1 :
      normalize(item.title).startsWith(needle) ? 2 : 3 }))
    .filter((item) => normalize(`${item.id} ${item.code || ""} ${item.title}`).includes(needle))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, "es"))
    .slice(0, LIMIT)
    .map(({ score, ...item }) => item);
};

module.exports = { searchForUser };
