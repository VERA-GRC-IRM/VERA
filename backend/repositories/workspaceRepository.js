const TABLE = "vera_user_workspace";
const entries = new Map();
const EMPTY = () => ({ favorites: [], views: [], recent: [] });
const LIMITS = { favorites: 20, views: 10, recent: 12 };

class WorkspaceError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

const validPath = (path) => typeof path === "string" && path.startsWith("/") &&
  !path.startsWith("//") && !path.startsWith("/\\") && path.length <= 500 &&
  !/[\p{Cc}\\]/u.test(path);
const cleanPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceError("El espacio personal no es válido.", 400);
  }
  const payload = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    const items = value[key];
    if (!Array.isArray(items) || items.length > limit) {
      throw new WorkspaceError("El espacio personal supera sus límites.", 400);
    }
    const paths = new Set();
    payload[key] = items.map((item) => {
      if (!item || !validPath(item.path) || typeof item.label !== "string" ||
          !item.label.trim() || item.label.length > 80 || paths.has(item.path)) {
        throw new WorkspaceError("El espacio personal contiene un enlace no válido.", 400);
      }
      paths.add(item.path);
      return { path: item.path, label: item.label.trim() };
    });
  }
  return payload;
};

const remote = () => process.env.VERA_WORKSPACE_STORE === "supabase";
const request = async (method, query = {}, body) => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new WorkspaceError("El espacio privado no está configurado.");
  let root;
  try { root = new URL(process.env.SUPABASE_URL); } catch {
    throw new WorkspaceError("La URL del espacio privado no es válida.");
  }
  if (root.protocol !== "https:") throw new WorkspaceError("El espacio privado requiere HTTPS.");
  const url = new URL(`/rest/v1/${TABLE}`, root);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = { apikey: key, Accept: "application/json", Prefer: "return=representation" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try { response = await fetch(url, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new WorkspaceError("No se pudo conectar con el espacio privado."); }
  if (response.status === 409) throw new WorkspaceError("El espacio cambió en otro dispositivo.", 409);
  if (!response.ok) throw new WorkspaceError("El espacio privado rechazó la operación.");
  try { return await response.json(); } catch { throw new WorkspaceError("El espacio privado devolvió datos inválidos."); }
};
const publicRow = (row) => ({ version: row.version, payload: cleanPayload(row.payload),
  updatedAt: row.updated_at });

const get = async (user) => {
  if (remote()) {
    const rows = await request("GET", { select: "payload,version,updated_at",
      user_id: `eq.${Number(user.id)}`, limit: "1" });
    if (!Array.isArray(rows)) throw new WorkspaceError("El espacio privado devolvió datos inválidos.");
    return rows[0] ? publicRow(rows[0]) : { version: 0, payload: EMPTY(), updatedAt: null };
  }
  const row = entries.get(Number(user.id));
  return row ? publicRow(row) : { version: 0, payload: EMPTY(), updatedAt: null };
};

const save = async (user, expectedVersion, value) => {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new WorkspaceError("La versión del espacio no es válida.", 400);
  }
  const payload = cleanPayload(value);
  const userId = Number(user.id);
  const updatedAt = new Date().toISOString();
  const next = { user_id: userId, payload, version: expectedVersion + 1, updated_at: updatedAt };
  if (remote()) {
    const rows = expectedVersion === 0
      ? await request("POST", { select: "payload,version,updated_at" }, next)
      : await request("PATCH", { select: "payload,version,updated_at",
        user_id: `eq.${userId}`, version: `eq.${expectedVersion}` },
      { payload, version: expectedVersion + 1, updated_at: updatedAt });
    if (!Array.isArray(rows) || !rows.length) throw new WorkspaceError("El espacio cambió en otro dispositivo.", 409);
    return publicRow(rows[0]);
  }
  const current = entries.get(userId);
  if ((current?.version || 0) !== expectedVersion) {
    throw new WorkspaceError("El espacio cambió en otro dispositivo.", 409);
  }
  entries.set(userId, next);
  return publicRow(next);
};

module.exports = { WorkspaceError, cleanPayload, get, save };
