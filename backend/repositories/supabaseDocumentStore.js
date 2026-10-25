const PAGE_SIZE = 1000;
const TABLES = new Set(["vera_risks", "vera_controls", "vera_findings", "vera_evidence", "vera_audit_comments", "vera_notification_reads", "vera_actions", "vera_org_units", "vera_org_grants", "vera_risk_library", "vera_business_context", "vera_risk_methods"]);

class DomainStorageError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
    this.domainStorage = true;
  }
}

const config = () => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) {
    throw new DomainStorageError("Falta configurar Supabase para datos GRC.");
  }
  let root;
  try { root = new URL(process.env.SUPABASE_URL); } catch {
    throw new DomainStorageError("La URL de Supabase no es válida.");
  }
  if (root.protocol !== "https:") throw new DomainStorageError("La URL de Supabase debe usar HTTPS.");
  return { root, key };
};

const createStore = (table) => {
  if (!TABLES.has(table)) throw new Error("Tabla de documentos no permitida.");
  const request = async (method, query = {}, body, range) => {
    const { root, key } = config();
    const url = new URL(`/rest/v1/${table}`, root);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const headers = { apikey: key, Accept: "application/json", Prefer: "return=representation" };
    if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (range) headers.Range = range;
    let response;
    try {
      response = await fetch(url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new DomainStorageError("No se pudo conectar con la base de datos.");
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.code === "23505") throw new DomainStorageError("Ya existe un registro con los mismos datos únicos.", 409);
      throw new DomainStorageError("La base de datos rechazó la operación.");
    }
    return response.status === 204 ? [] : response.json();
  };

  const unpack = (row) => row ? { ...row.payload, storageVersion: row.version } : null;
  const getAll = async (filters = {}) => {
    const documents = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await request("GET", { select: "payload,version", order: "created_at.desc", ...filters }, undefined, `${offset}-${offset + PAGE_SIZE - 1}`);
      documents.push(...rows.map(unpack));
      if (rows.length < PAGE_SIZE) break;
    }
    return documents;
  };
  const findById = async (id) => {
    const rows = await request("GET", { select: "payload,version", id: `eq.${id}`, limit: "1" });
    return unpack(rows[0]);
  };
  const create = async (payload, extraColumns = {}) => {
    const rows = await request("POST", { select: "payload,version" }, { id: payload.id, payload, ...extraColumns });
    return unpack(rows[0]);
  };
  const mutate = async (id, changes, expectedVersion, extraColumns = {}) => {
    const current = await findById(id);
    if (!current) return null;
    if (expectedVersion !== undefined && current.storageVersion !== expectedVersion) {
      throw new DomainStorageError("El registro cambió mientras lo editabas. Actualiza y vuelve a intentar.", 409);
    }
    const { storageVersion, ...payload } = current;
    const next = { ...payload, ...changes, updatedAt: new Date().toISOString() };
    const rows = await request("PATCH", {
      select: "payload,version", id: `eq.${id}`, version: `eq.${current.storageVersion}`
    }, { payload: next, version: current.storageVersion + 1, updated_at: new Date().toISOString(), ...extraColumns });
    if (!rows.length) throw new DomainStorageError("El registro cambió mientras lo editabas. Actualiza y vuelve a intentar.", 409);
    return unpack(rows[0]);
  };
  return { getAll, findById, create, mutate };
};

module.exports = { createStore, DomainStorageError };
