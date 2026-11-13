const { visibleCollectionsForUser } = require("./recordReadAccessService");
const { listForUser: listBusinessContextForUser } = require("./businessContextService");
const evidenceRepository = require("../repositories/evidenceRepository");
const conversations = require("../repositories/assistantConversationRepository");
const { currentScope } = require("./assistantConversationScope");
const { visibleUsers } = require("./assistantUserDirectoryService");
const evidenceTextIndex = require("../repositories/evidenceTextIndex");
const { SEARCHABLE_MIME } = require("./evidenceTextExtraction");
const { IMAGE_MIME } = require("./azureVisionOcrService");

const normalize = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const LIMIT = 24;

// La consulta privada admite 500 IDs por llamada. Consultar cada lote evita
// que la posición del archivo en el portafolio determine si puede encontrarse.
const searchIndexedEvidence = async (ids, query, search = evidenceTextIndex.search) => {
  const matches = [];
  const batchSize = evidenceTextIndex.MAX_SEARCH_FILES;
  for (let offset = 0; offset < ids.length; offset += batchSize * 4) {
    const batches = [];
    for (let start = offset; start < Math.min(ids.length, offset + batchSize * 4); start += batchSize) {
      batches.push(search(ids.slice(start, start + batchSize), query));
    }
    matches.push(...(await Promise.all(batches)).flat());
  }
  return matches.sort((a, b) => b.score - a.score || a.evidenceId.localeCompare(b.evidenceId))
    .slice(0, 5);
};

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
  const visibleIds = Object.fromEntries(["AUDIT", "RISK", "CONTROL", "FINDING"].map((type) =>
    [type, new Set(collections[type].map((item) => item.id))]));
  const scopedEvidence = evidence.filter((item) => visibleIds[item.entityType]?.has(item.entityId));
  const visibleEvidence = scopedEvidence.filter((item) =>
    normalize(`${item.id} ${item.title} ${item.reference || ""}`).includes(needle)).slice(0, LIMIT);
  const titleIds = new Set(visibleEvidence.map((item) => item.id));
  const searchable = scopedEvidence.filter((item) => item.file &&
    (SEARCHABLE_MIME.has(item.file.mime) || IMAGE_MIME.has(item.file.mime)));
  const contentMatches = query.trim().length >= 4 && searchable.length
    ? await searchIndexedEvidence(searchable.map((item) => item.id), query.trim()) : [];
  const byEvidenceId = new Map(searchable.map((item) => [item.id, item]));
  const contentIds = new Set();
  const contentEvidence = contentMatches.filter((row) => {
    if (!byEvidenceId.has(row.evidenceId) || titleIds.has(row.evidenceId) ||
        contentIds.has(row.evidenceId)) return false;
    contentIds.add(row.evidenceId);
    return true;
  }).map((row) => byEvidenceId.get(row.evidenceId));
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
    ...contentEvidence.map((item) => ({ type: "EVIDENCE", id: item.id, title: item.title,
      match: "content", path: `/evidencias#evidence-${encodeURIComponent(item.id)}` })),
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
    .filter((item) => item.match === "content" ||
      normalize(`${item.id} ${item.code || ""} ${item.title}`).includes(needle))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, "es"))
    .slice(0, LIMIT)
    .map(({ score, ...item }) => item);
};

module.exports = { searchForUser, searchIndexedEvidence };
