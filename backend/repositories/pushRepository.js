const { createHash, randomUUID } = require("node:crypto");

const subscriptions = new Map();
const claims = new Set();
class PushError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; this.pushError = true; }
}
const remote = () => process.env.VERA_PUSH_STORE === "supabase";
const hash = (endpoint) => createHash("sha256").update(endpoint).digest("hex");
const request = async (table, method, query = {}, body) => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new PushError("Avisos push sin almacén privado.");
  let root;
  try { root = new URL(process.env.SUPABASE_URL); } catch { throw new PushError("Almacén push no válido."); }
  if (root.protocol !== "https:") throw new PushError("Almacén push requiere HTTPS.");
  const url = new URL(`/rest/v1/${table}`, root);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = { apikey: key, Accept: "application/json", Prefer: "return=representation" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try { response = await fetch(url, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new PushError("No se pudo conectar al almacén push."); }
  if (response.status === 409) throw new PushError("Entrega ya registrada.", 409);
  if (!response.ok) throw new PushError("El almacén push rechazó la operación.");
  try { return await response.json(); } catch { throw new PushError("El almacén push devolvió datos inválidos."); }
};
const table = (name, method, query, body) => request(name, method, { select: "*", ...query }, body);
const upsert = async (userId, data) => {
  const endpointHash = hash(data.endpoint);
  const now = new Date().toISOString();
  const row = { id: randomUUID(), user_id: Number(userId), endpoint_hash: endpointHash,
    endpoint: data.endpoint, p256dh: data.keys.p256dh, auth_secret: data.keys.auth,
    created_at: now, updated_at: now };
  if (remote()) {
    const old = (await table("vera_push_subscriptions", "GET", { endpoint_hash: `eq.${endpointHash}`, limit: "1" }))[0];
    if (old) {
      const changed = await table("vera_push_subscriptions", "PATCH", { id: `eq.${old.id}` },
        { user_id: row.user_id, endpoint: row.endpoint, p256dh: row.p256dh,
          auth_secret: row.auth_secret, updated_at: now });
      return changed[0];
    }
    try { return (await table("vera_push_subscriptions", "POST", {}, row))[0]; }
    catch (error) {
      if (error.status !== 409) throw error;
      return (await table("vera_push_subscriptions", "PATCH", { endpoint_hash: `eq.${endpointHash}` },
        { user_id: row.user_id, endpoint: row.endpoint, p256dh: row.p256dh,
          auth_secret: row.auth_secret, updated_at: now }))[0];
    }
  }
  const old = subscriptions.get(endpointHash);
  if (old) row.id = old.id;
  subscriptions.set(endpointHash, row);
  return row;
};
const remove = async (userId, endpoint) => {
  const endpointHash = hash(endpoint);
  if (remote()) return (await table("vera_push_subscriptions", "DELETE", {
    user_id: `eq.${Number(userId)}`, endpoint_hash: `eq.${endpointHash}`, select: "id" })).length > 0;
  const row = subscriptions.get(endpointHash);
  return row?.user_id === Number(userId) ? subscriptions.delete(endpointHash) : false;
};
const list = async (userId) => remote()
  ? table("vera_push_subscriptions", "GET", { user_id: `eq.${Number(userId)}`, limit: "5" })
  : [...subscriptions.values()].filter((row) => row.user_id === Number(userId)).slice(0, 5);
const claimed = async (subscriptionId, eventKey) => {
  if (remote()) {
    try { await table("vera_push_deliveries", "POST", {},
      { subscription_id: subscriptionId, event_key: eventKey }); return true; }
    catch (error) { if (error.status === 409) return false; throw error; }
  }
  const key = `${subscriptionId}:${eventKey}`;
  if (claims.has(key)) return false;
  claims.add(key);
  return true;
};
const mark = async (subscriptionId, eventKey, status) => {
  if (remote()) await table("vera_push_deliveries", "PATCH", {
    subscription_id: `eq.${subscriptionId}`, event_key: `eq.${eventKey}`, select: "subscription_id" }, { status });
};
module.exports = { PushError, hash, upsert, remove, list, claimed, mark };
