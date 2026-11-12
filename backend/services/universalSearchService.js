const { visibleCollectionsForUser } = require("./recordReadAccessService");
const { listForUser: listBusinessContextForUser } = require("./businessContextService");
const evidenceRepository = require("../repositories/evidenceRepository");
const conversations = require("../repositories/assistantConversationRepository");
const { currentScope } = require("./assistantConversationScope");
const { visibleUsers } = require("./assistantUserDirectoryService");

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
  const [collections, context, evidence, people, threads] = await Promise.all([
    visibleCollectionsForUser(user), listBusinessContextForUser(user), evidenceRepository.getAll(),
    visibleUsers(user), conversations.list(user)
  ]);
  const matchingThreads = threads.filter((item) =>
    normalize(`${item.id} ${item.title}`).includes(needle));
  const scopedThreads = (await Promise.all(matchingThreads.map(async (item) => {
    const stored = await conversations.get(user, item.id);
    if (!stored || stored.scopeHash !== await currentScope(user, stored.focus)) return null;
    return item;
  }))).filter(Boolean);
  const visibleIds = Object.fromEntries(["AUDIT", "RISK", "CONTROL"].map((type) =>
    [type, new Set(collections[type].map((item) => item.id))]));
  const visibleEvidence = evidence.filter((item) => visibleIds[item.entityType]?.has(item.entityId) &&
    normalize(`${item.id} ${item.title} ${item.reference || ""}`).includes(needle)).slice(0, LIMIT);
  const candidates = [
    ...collections.AUDIT.map((item) => ({ type: "AUDIT", id: item.id, title: item.title,
      path: `/auditorias?auditId=${encodeURIComponent(item.id)}` })),
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
      code: item.code, path: `/mapa-negocio?context=${encodeURIComponent(item.contextId)}` })),
    ...(people || []).map((item) => ({ type: "USER", id: String(item.id), title: item.name,
      code: item.email, path: `/usuarios?userId=${encodeURIComponent(item.id)}` })),
    ...scopedThreads.map((item) => ({ type: "CONVERSATION", id: item.id, title: item.title,
      path: `/asistente?${new URLSearchParams({ ...(item.focus
        ? { type: item.focus.type, id: item.focus.id } : {}), conversation: item.id })}` }))
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
