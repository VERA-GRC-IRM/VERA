const STATUSES = new Set(["OPEN", "APPROVED", "ACTIVE", "CLOSED", "REJECTED"]);
const RISKS = new Set(["Bajo", "Medio", "Alto"]);
const TYPES = new Set(["Interna", "Externa"]);
const QUARTERS = new Set(["Q1", "Q2", "Q3", "Q4"]);

const fold = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

const parseAuditFilters = (query) => {
  const fields = ["q", "status", "risk", "type", "quarter", "year", "orgUnitId", "responsibleId"];
  if (fields.some((field) => Array.isArray(query[field]))) {
    return { error: "Cada filtro debe tener un solo valor." };
  }
  const q = String(query.q ?? "").trim();
  const status = String(query.status ?? "").trim();
  const risk = String(query.risk ?? "").trim();
  const type = String(query.type ?? "").trim();
  const quarter = String(query.quarter ?? "").trim();
  const year = String(query.year ?? "").trim();
  const orgUnitId = String(query.orgUnitId ?? "").trim();
  const responsibleId = String(query.responsibleId ?? "").trim();
  if (q.length > 120) return { error: "La búsqueda no puede superar 120 caracteres." };
  if (status && !STATUSES.has(status)) return { error: "El estado no es válido." };
  if (risk && !RISKS.has(risk)) return { error: "El nivel de riesgo no es válido." };
  if (type && !TYPES.has(type)) return { error: "El tipo de auditoría no es válido." };
  if (quarter && !QUARTERS.has(quarter)) return { error: "El trimestre no es válido." };
  if (year && !/^(20[2-9]\d|2100)$/.test(year)) return { error: "El año no es válido." };
  if (orgUnitId && !/^ORG-[0-9a-f-]{36}$/i.test(orgUnitId)) return { error: "La unidad no es válida." };
  if (responsibleId && !/^[1-9]\d{0,9}$/.test(responsibleId)) return { error: "El responsable no es válido." };
  return { filters: { q: fold(q), status, risk, type, quarter, year, orgUnitId, responsibleId } };
};

const searchAudits = (audits, filters) => audits.filter((audit) => {
  if (filters.status && audit.status !== filters.status) return false;
  if (filters.risk && audit.risk !== filters.risk) return false;
  if (filters.type && audit.type !== filters.type) return false;
  if (filters.quarter && audit.quarter !== filters.quarter) return false;
  if (filters.year && String(audit.year) !== filters.year) return false;
  if (filters.orgUnitId && audit.orgUnitId !== filters.orgUnitId) return false;
  if (filters.responsibleId && String(audit.responsibleId ?? "") !== filters.responsibleId) return false;
  return !filters.q || [audit.id, audit.title, audit.area, audit.objective, audit.responsible]
    .some((value) => fold(value).includes(filters.q));
});

module.exports = { parseAuditFilters, searchAudits };
