const normalize = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");

const searchableText = (item) => [item.id, item.title, item.name, item.auditTitle,
  item.riskTitle, item.controlTitle, item.code, item.area, item.status, item.description]
  .filter((value) => typeof value === "string" || typeof value === "number")
  .map(normalize).join(" ");

export const searchOfflineRecords = (snapshots, modules, {
  query, moduleId = "", now = Date.now(), ttlMs, limit = 50
}) => {
  const term = normalize(query).trim();
  if (term.length < 2) return [];
  const matches = [];
  for (const module of modules) {
    if (!module.listKey || (moduleId && module.id !== moduleId)) continue;
    const snapshot = snapshots[module.id];
    const age = now - Date.parse(snapshot?.savedAt);
    if (!snapshot || !Number.isFinite(age) || age < 0 || age > ttlMs) continue;
    const rows = snapshot.data?.[module.listKey];
    if (!Array.isArray(rows)) continue;
    for (const item of rows) {
      if (!item || typeof item !== "object" || !searchableText(item).includes(term)) continue;
      matches.push({ moduleId: module.id, moduleLabel: module.label, link: module.link,
        id: String(item.id ?? ""),
        title: String(item.title || item.name || item.auditTitle || item.code || item.id || "Registro"),
        status: typeof item.status === "string" ? item.status : "",
        savedAt: snapshot.savedAt });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
};
