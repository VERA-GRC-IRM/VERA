const { randomUUID } = require("node:crypto");

const TABLE = "vera_audit_proposals";
const PAGE_SIZE = 1000;
const normalize = (value) => String(value ?? "").trim().toLowerCase();

class PlanningStorageError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.planningStorage = true;
  }
}

const config = () => {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new PlanningStorageError("Falta configurar la conexión de Supabase para planificación.", 503);
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PlanningStorageError("La URL de Supabase no es válida.", 503);
  }
  if (url.protocol !== "https:") {
    throw new PlanningStorageError("La URL de Supabase debe usar HTTPS.", 503);
  }
  return { url, key };
};

const request = async (method, query = {}, body, range) => {
  const { url: root, key } = config();
  const url = new URL(`/rest/v1/${TABLE}`, root);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers = {
    apikey: key,
    Accept: "application/json",
    Prefer: "return=representation"
  };
  // Las claves legacy son JWT; las nuevas sb_secret_* se envían solo como apikey.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (range) headers.Range = range;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new PlanningStorageError("No se pudo conectar con la base de datos de planificación.", 503);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === "23505") {
      throw new PlanningStorageError("Ya existe una propuesta con el mismo título, área y año.", 409);
    }
    throw new PlanningStorageError("La base de datos de planificación rechazó la operación.", 503);
  }
  return response.status === 204 ? [] : response.json();
};

const unpack = (row) => row ? { ...row.payload, storageVersion: row.version } : null;

const getAll = async () => {
  const proposals = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await request("GET", { select: "payload,version" }, undefined, `${offset}-${offset + PAGE_SIZE - 1}`);
    proposals.push(...rows.map(unpack));
    if (rows.length < PAGE_SIZE) break;
  }
  return proposals.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
};

const findById = async (id) => {
  const rows = await request("GET", { select: "payload,version", id: `eq.${id}`, limit: "1" });
  return unpack(rows[0]);
};

const findDuplicate = async ({ title, area, year, orgUnitId }, excludeId = null) =>
  (await getAll()).find((proposal) => proposal.id !== excludeId &&
    (proposal.orgUnitId || null) === (orgUnitId || null) &&
    normalize(proposal.title) === normalize(title) &&
    normalize(proposal.area) === normalize(area) && proposal.year === year) || null;

const create = async (data) => {
  const proposal = {
    ...data,
    id: `AUD-${randomUUID()}`,
    status: "OPEN",
    approval: 0,
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    approvedBy: null,
    approvedAt: null,
    startedBy: null,
    startedAt: null,
    closedBy: null,
    closedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null
  };
  const rows = await request("POST", { select: "payload,version" }, { id: proposal.id, payload: proposal });
  return unpack(rows[0]);
};

const mutate = async (id, changes, expectedVersion) => {
  const current = await findById(id);
  if (!current) return null;
  const version = expectedVersion ?? current.storageVersion;
  const { storageVersion, ...payload } = current;
  const next = { ...payload, ...changes, updatedAt: new Date().toISOString() };
  const rows = await request("PATCH", {
    select: "payload,version", id: `eq.${id}`, version: `eq.${version}`
  }, { payload: next, version: version + 1 });
  if (!rows.length) throw new PlanningStorageError("La propuesta cambió mientras la editabas. Actualiza y vuelve a intentar.", 409);
  return unpack(rows[0]);
};

const update = (id, data, expectedVersion) => mutate(id, data, expectedVersion);
const approve = (id, { quarter, approvedBy }, expectedVersion) => mutate(id, {
  status: "APPROVED", approval: 100, quarter, approvedBy, approvedAt: new Date().toISOString()
}, expectedVersion);
const start = (id, { startedBy }, expectedVersion) => mutate(id, {
  status: "ACTIVE", progress: 0, startedBy, startedAt: new Date().toISOString()
}, expectedVersion);
const close = (id, { closedBy }, expectedVersion) => mutate(id, {
  status: "CLOSED", progress: 100, closedBy, closedAt: new Date().toISOString()
}, expectedVersion);
const reject = (id, { rejectionReason, rejectedBy }, expectedVersion) => mutate(id, {
  status: "REJECTED", rejectionReason, rejectedBy, rejectedAt: new Date().toISOString()
}, expectedVersion);

const remove = async (id, expectedVersion) => {
  const current = await findById(id);
  if (!current) return null;
  const rows = await request("DELETE", {
    select: "payload,version", id: `eq.${id}`, version: `eq.${expectedVersion ?? current.storageVersion}`
  });
  if (!rows.length) throw new PlanningStorageError("La propuesta cambió mientras la eliminabas. Actualiza y vuelve a intentar.", 409);
  return unpack(rows[0]);
};

module.exports = { getAll, findById, findDuplicate, create, update, approve, start, close, reject, remove };
