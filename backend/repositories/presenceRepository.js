const memory = new Map();
const remote = () => process.env.VERA_PRESENCE_STORE === "supabase";

class PresenceStorageError extends Error {
  constructor() { super("No se pudo consultar la presencia de edición."); this.status = 503; }
}

const request = async (method, query = {}, body) => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new PresenceStorageError();
  let url;
  try { url = new URL("/rest/v1/vera_record_presence", process.env.SUPABASE_URL); }
  catch { throw new PresenceStorageError(); }
  if (url.protocol !== "https:") throw new PresenceStorageError();
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = { apikey: key, Accept: "application/json",
    Prefer: method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=representation" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try { response = await fetch(url, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new PresenceStorageError(); }
  if (!response.ok) throw new PresenceStorageError();
  return response.status === 204 ? [] : response.json().catch(() => { throw new PresenceStorageError(); });
};

const keyFor = (userId, clientId) => `${userId}:${clientId}`;
const upsert = async (userId, clientId, type, recordId) => {
  const row = { user_id: Number(userId), client_id: clientId, record_type: type,
    record_id: recordId, expires_at: new Date(Date.now() + 30_000).toISOString(),
    updated_at: new Date().toISOString() };
  if (remote()) return (await request("POST", { on_conflict: "user_id,client_id" }, row))[0];
  memory.set(keyFor(userId, clientId), row);
  return row;
};
const list = async (type, recordId) => {
  const now = new Date().toISOString();
  return remote() ? request("GET", { select: "user_id,client_id,expires_at",
    record_type: `eq.${type}`, record_id: `eq.${recordId}`, expires_at: `gt.${now}`, limit: "30" })
    : [...memory.values()].filter((row) => row.record_type === type && row.record_id === recordId && row.expires_at > now);
};
const remove = async (userId, clientId) => {
  if (remote()) return request("DELETE", { user_id: `eq.${Number(userId)}`, client_id: `eq.${clientId}` });
  return memory.delete(keyFor(userId, clientId));
};
const cleanupExpired = async () => {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  if (remote()) {
    const removed = await request("DELETE", { expires_at: `lt.${cutoff}`, select: "client_id" });
    return removed.length;
  }
  let removed = 0;
  for (const [key, row] of memory) {
    if (row.expires_at < cutoff) { memory.delete(key); removed += 1; }
  }
  return removed;
};
module.exports = { upsert, list, remove, cleanupExpired, PresenceStorageError };
