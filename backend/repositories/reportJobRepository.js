const { randomUUID } = require("node:crypto");

const TABLE = "vera_report_jobs";
const jobs = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class JobError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; this.jobError = true; }
}
const remote = () => process.env.VERA_JOB_STORE === "supabase";
const secret = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const request = async (method, path, query = {}, body) => {
  const key = secret();
  if (!process.env.SUPABASE_URL || !key) throw new JobError("El centro de trabajos no está configurado.");
  let root;
  try { root = new URL(process.env.SUPABASE_URL); } catch { throw new JobError("El almacén de trabajos no es válido."); }
  if (root.protocol !== "https:") throw new JobError("El almacén de trabajos requiere HTTPS.");
  const url = new URL(path, root);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = { apikey: key, Accept: "application/json", Prefer: "return=representation" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try { response = await fetch(url, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new JobError("No se pudo conectar con el centro de trabajos."); }
  if (!response.ok) {
    if (response.status === 409) throw new JobError("El trabajo ya existe.", 409);
    throw new JobError("El centro de trabajos rechazó la operación.");
  }
  try { return await response.json(); } catch { throw new JobError("El centro de trabajos devolvió datos inválidos."); }
};
const table = (method, query, body) => request(method, `/rest/v1/${TABLE}`,
  { select: "*", ...query }, body);
const ownerQuery = (user) => ({ owner_id: `eq.${Number(user.id)}` });
const publicRow = (row) => ({ id: row.id, format: row.format, filters: row.filters,
  status: row.status, attempts: row.attempts, cancelRequested: row.cancel_requested,
  createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at,
  errorCode: row.error_code });
const get = async (user, id, includeResult = false) => {
  if (!UUID.test(id)) return null;
  const row = remote()
    ? (await table("GET", { ...ownerQuery(user), id: `eq.${id}`, limit: "1",
      select: includeResult ? "*" : "id,owner_id,format,filters,status,attempts,cancel_requested,created_at,updated_at,expires_at,error_code" }))[0]
    : jobs.get(id);
  if (!row || row.owner_id !== Number(user.id)) return null;
  return includeResult ? row : publicRow(row);
};
const list = async (user) => {
  const rows = remote() ? await table("GET", { ...ownerQuery(user),
    order: "created_at.desc", limit: "20", select: "id,format,filters,status,attempts,cancel_requested,created_at,updated_at,expires_at,error_code" })
    : [...jobs.values()].filter((row) => row.owner_id === Number(user.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
  if (!Array.isArray(rows)) throw new JobError("El centro de trabajos devolvió datos inválidos.");
  return rows.map(publicRow);
};
const create = async (user, requestKey, format, filters) => {
  if (!UUID.test(requestKey)) throw new JobError("La clave de solicitud no es válida.", 400);
  const old = remote() ? (await table("GET", { ...ownerQuery(user), request_key: `eq.${requestKey}`, limit: "1" }))[0]
    : [...jobs.values()].find((item) => item.owner_id === Number(user.id) && item.request_key === requestKey);
  if (old) return publicRow(old);
  const own = await list(user);
  if (own.filter((item) => ["QUEUED", "RUNNING"].includes(item.status)).length >= 3) {
    throw new JobError("Espera a que terminen tus otros trabajos.", 429);
  }
  const now = new Date().toISOString();
  const row = { id: randomUUID(), owner_id: Number(user.id), owner_role: user.role,
    request_key: requestKey, format, filters, status: "QUEUED", attempts: 0,
    claim_token: null, lease_until: null, cancel_requested: false,
    result_base64: null, result_source_ids: null, error_code: null,
    created_at: now, updated_at: now,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  if (remote()) {
    try { return publicRow((await table("POST", {}, row))[0]); }
    catch (error) {
      if (error.status !== 409) throw error;
      const duplicate = (await table("GET", { ...ownerQuery(user), request_key: `eq.${requestKey}`, limit: "1" }))[0];
      if (!duplicate) throw error;
      return publicRow(duplicate);
    }
  }
  jobs.set(row.id, row);
  return publicRow(row);
};
const cancel = async (user, id) => {
  const row = await get(user, id, true);
  if (!row) return null;
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(row.status)) return publicRow(row);
  const patch = { cancel_requested: true, status: "CANCELLED",
    updated_at: new Date().toISOString() };
  if (remote()) {
    const changed = await table("PATCH", { ...ownerQuery(user), id: `eq.${id}`,
      status: `eq.${row.status}` }, patch);
    return changed[0] ? publicRow(changed[0]) : get(user, id);
  }
  const current = jobs.get(id);
  Object.assign(current, patch);
  return publicRow(current);
};
const claim = async () => {
  if (remote()) {
    const rows = await request("POST", "/rest/v1/rpc/claim_vera_report_job", {}, {});
    return rows?.[0] || null;
  }
  const row = [...jobs.values()].find((item) =>
    (item.status === "QUEUED" || (item.status === "RUNNING" && Date.parse(item.lease_until) < Date.now())) &&
    item.attempts < 3 && !item.cancel_requested && Date.parse(item.expires_at) > Date.now());
  if (!row) return null;
  Object.assign(row, { status: "RUNNING", attempts: row.attempts + 1, claim_token: randomUUID(),
    lease_until: new Date(Date.now() + 4 * 60_000).toISOString(), updated_at: new Date().toISOString() });
  return { ...row };
};
const finish = async (claimed, status, values = {}) => {
  const patch = { status, lease_until: null, claim_token: null, updated_at: new Date().toISOString(),
    result_base64: status === "COMPLETED" ? values.base64 : null,
    result_source_ids: status === "COMPLETED" ? values.sourceIds : null,
    error_code: values.errorCode || null };
  if (remote()) {
    const rows = await table("PATCH", { id: `eq.${claimed.id}`, status: "eq.RUNNING",
      claim_token: `eq.${claimed.claim_token}`, cancel_requested: "eq.false" }, patch);
    return rows.length > 0;
  }
  const row = jobs.get(claimed.id);
  if (!row || row.claim_token !== claimed.claim_token || row.cancel_requested) return false;
  Object.assign(row, patch);
  return true;
};
const retryOrFail = async (claimed) => {
  const status = claimed.attempts >= 3 ? "FAILED" : "QUEUED";
  return finish(claimed, status, { errorCode: "PROCESSING_FAILED" });
};
const clearExpired = async () => {
  if (remote()) return table("DELETE", { expires_at: `lt.${new Date().toISOString()}`, select: "id" });
  for (const [id, row] of jobs) if (Date.parse(row.expires_at) < Date.now()) jobs.delete(id);
};

module.exports = { JobError, UUID, publicRow, get, list, create, cancel, claim,
  finish, retryOrFail, clearExpired };
