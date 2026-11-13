const PREFIX = "vera:workspace:v1:";
const EMPTY = () => ({ favorites: [], views: [], recent: [] });
const validUserId = (id) => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const validPath = (path) => typeof path === "string" && path.startsWith("/") &&
  !path.startsWith("//") && !path.startsWith("/\\") && path.length <= 500 && !/[\p{Cc}\\]/u.test(path);
const clean = (items, limit) => Array.isArray(items) ? items.filter((item) =>
  item && validPath(item.path) && typeof item.label === "string" && item.label.length <= 80)
  .slice(0, limit).map(({ path, label }) => ({ path, label })) : [];
const keyFor = (id) => validUserId(id) ? `${PREFIX}${Number(id)}` : null;

export function readWorkspace(id) {
  const key = keyFor(id);
  if (!key) return EMPTY();
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    return { favorites: clean(stored.favorites, 20), views: clean(stored.views, 10),
      recent: clean(stored.recent, 12) };
  } catch { return EMPTY(); }
}

function writeWorkspace(id, next) {
  const key = keyFor(id);
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("vera:workspace-change", { detail: { userId: Number(id) } }));
    return true;
  } catch { return false; }
}

export function replaceWorkspace(id, next) {
  const key = keyFor(id);
  if (!key) return false;
  const payload = { favorites: clean(next?.favorites, 20), views: clean(next?.views, 10),
    recent: clean(next?.recent, 12) };
  try {
    const serialized = JSON.stringify(payload);
    if (localStorage.getItem(key) !== serialized) {
      localStorage.setItem(key, serialized);
      window.dispatchEvent(new CustomEvent("vera:workspace-change",
        { detail: { userId: Number(id), source: "remote" } }));
    }
    return true;
  } catch { return false; }
}

export function toggleFavorite(id, path, label) {
  if (!validPath(path) || typeof label !== "string" || !label.trim() || label.length > 80) return null;
  const current = readWorkspace(id);
  const exists = current.favorites.some((item) => item.path === path);
  current.favorites = exists ? current.favorites.filter((item) => item.path !== path) :
    [{ path, label: label.trim() }, ...current.favorites].slice(0, 20);
  return writeWorkspace(id, current) ? !exists : null;
}

export function saveView(id, path, label) {
  if (!validPath(path) || typeof label !== "string" || label.trim().length < 3 || label.length > 80) return false;
  const current = readWorkspace(id);
  current.views = [{ path, label: label.trim() }, ...current.views.filter((item) => item.path !== path)].slice(0, 10);
  return writeWorkspace(id, current);
}

export function recordVisit(id, path, label) {
  if (!validPath(path) || typeof label !== "string" || !label.trim()) return;
  const current = readWorkspace(id);
  if (current.recent[0]?.path === path) return;
  current.recent = [{ path, label: label.trim().slice(0, 80) },
    ...current.recent.filter((item) => item.path !== path)].slice(0, 12);
  writeWorkspace(id, current);
}

export function removeWorkspaceItem(id, collection, path) {
  if (!["favorites", "views", "recent"].includes(collection)) return false;
  const current = readWorkspace(id);
  current[collection] = current[collection].filter((item) => item.path !== path);
  return writeWorkspace(id, current);
}
