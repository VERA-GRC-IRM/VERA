const API = `${import.meta.env?.VITE_API_URL || "/api"}/workspace`;
const LIMITS = { favorites: 20, views: 10, recent: 12 };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function mergeWorkspace(base, local, remote) {
  const merged = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    const previous = new Map((base[key] || []).map((item) => [item.path, item]));
    const current = new Map((local[key] || []).map((item) => [item.path, item]));
    const changed = (local[key] || []).filter((item) => !same(previous.get(item.path), item));
    const removed = new Set([...previous.keys()].filter((path) => !current.has(path)));
    const changedPaths = new Set(changed.map((item) => item.path));
    merged[key] = [...changed, ...(remote[key] || []).filter((item) =>
      !removed.has(item.path) && !changedPaths.has(item.path))].slice(0, limit);
  }
  return merged;
}

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token") || ""}` });
const decode = async (response) => {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "No se pudo sincronizar tu espacio.");
    error.status = response.status;
    throw error;
  }
  return data;
};
export const fetchWorkspace = async () => decode(await fetch(API,
  { headers: headers(), cache: "no-store" }));
export const saveWorkspace = async (expectedVersion, payload) => decode(await fetch(API, {
  method: "PUT", headers: { ...headers(), "Content-Type": "application/json" },
  body: JSON.stringify({ expectedVersion, payload })
}));
