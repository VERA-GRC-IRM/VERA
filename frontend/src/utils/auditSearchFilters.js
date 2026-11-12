export const AUDIT_FILTER_KEYS = ["q", "status", "risk", "type", "quarter", "year", "orgUnitId", "responsibleId"];
export const emptyAuditFilters = () => Object.fromEntries(AUDIT_FILTER_KEYS.map((key) => [key, ""]));
export const readAuditFilters = (params) => Object.fromEntries(AUDIT_FILTER_KEYS.map((key) =>
  [key, (params.get(key) || "").slice(0, 120)]));
export const writeAuditFilters = (filters) => new URLSearchParams(AUDIT_FILTER_KEYS
  .filter((key) => filters[key]).map((key) => [key, filters[key]]));
