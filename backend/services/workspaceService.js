const repository = require("../repositories/workspaceRepository");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { canAccessEntity } = require("./evidenceCreationService");
const evidenceRepository = require("../repositories/evidenceRepository");
const conversations = require("../repositories/assistantConversationRepository");
const { currentScope } = require("./assistantConversationScope");
const { listForUser: listBusinessContextForUser } = require("./businessContextService");
const { visibleUsers } = require("./assistantUserDirectoryService");
const decoded = (value) => { try { return decodeURIComponent(value); } catch { return null; } };

const visiblePath = async (user, path) => {
  let url;
  try { url = new URL(path, "https://vera.local"); } catch { return false; }
  if (url.origin !== "https://vera.local") return false;
  if (url.pathname === "/auditorias" && url.searchParams.has("auditId")) {
    return Boolean(await visibleRecordForUser(user, "AUDIT", url.searchParams.get("auditId")));
  }
  const audit = /^\/auditorias-activas\/([^/]+)$/.exec(url.pathname);
  if (audit) return Boolean(decoded(audit[1]) && await visibleRecordForUser(user, "AUDIT", decoded(audit[1])));
  const risk = /^#risk-(.+)$/.exec(url.hash);
  if (url.pathname === "/riesgos" && risk) {
    return Boolean(decoded(risk[1]) && await visibleRecordForUser(user, "RISK", decoded(risk[1])));
  }
  const control = /^#control-(.+)$/.exec(url.hash);
  if (url.pathname === "/controles" && control) {
    return Boolean(decoded(control[1]) && await visibleRecordForUser(user, "CONTROL", decoded(control[1])));
  }
  const evidence = /^#evidence-(.+)$/.exec(url.hash);
  if (url.pathname === "/evidencias" && evidence) {
    const row = decoded(evidence[1]) && await evidenceRepository.findById(decoded(evidence[1]));
    return Boolean(row && await canAccessEntity(row.entityType, row.entityId, user));
  }
  if (url.pathname === "/mapa-negocio" && url.searchParams.has("context")) {
    return (await listBusinessContextForUser(user)).some((item) =>
      item.contextId === url.searchParams.get("context"));
  }
  if (url.pathname === "/usuarios") {
    const people = await visibleUsers(user);
    return Boolean(people && (!url.searchParams.has("userId") || people.some((item) =>
      String(item.id) === url.searchParams.get("userId"))));
  }
  if (url.pathname === "/asistente" && url.searchParams.has("conversation")) {
    const thread = await conversations.get(user, url.searchParams.get("conversation"));
    return Boolean(thread && thread.scopeHash === await currentScope(user, thread.focus));
  }
  return true;
};

const filterPayload = async (user, payload) => {
  const cache = new Map();
  const check = (path) => {
    if (!cache.has(path)) cache.set(path, visiblePath(user, path));
    return cache.get(path);
  };
  const filtered = {};
  for (const key of ["favorites", "views", "recent"]) {
    const allowed = await Promise.all(payload[key].map(async (item) => await check(item.path) ? item : null));
    filtered[key] = allowed.filter(Boolean);
  }
  return filtered;
};

const getForUser = async (user) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await repository.get(user);
    const payload = await filterPayload(user, current.payload);
    if (JSON.stringify(payload) === JSON.stringify(current.payload)) return current;
    try { return await repository.save(user, current.version, payload); }
    catch (error) { if (error.status !== 409 || attempt === 1) throw error; }
  }
};
const saveForUser = async (user, version, payload) => repository.save(user, version,
  await filterPayload(user, repository.cleanPayload(payload)));

module.exports = { visiblePath, filterPayload, getForUser, saveForUser };
