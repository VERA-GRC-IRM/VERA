const QUERY_KEYS = {
  "/auditorias": ["q", "status", "risk", "type", "quarter", "year", "orgUnitId", "responsibleId", "auditId"],
  "/riesgos": ["search", "area", "level", "response"],
  "/evidencias": ["q", "type"],
  "/mapa-negocio": ["context", "revision"],
  "/usuarios": ["userId"],
  "/asistente": ["type", "id", "conversation"]
};

const HASH_PREFIXES = {
  "/riesgos": "#risk-",
  "/controles": "#control-",
  "/evidencias": "#evidence-"
};

export function shareableLocation(location) {
  const path = /^\/(?!\/)[A-Za-z0-9/_%-]*$/.test(location.pathname)
    ? location.pathname : "/dashboard";
  const allowed = QUERY_KEYS[path] || [];
  const source = new URLSearchParams(location.search || "");
  const query = new URLSearchParams();
  for (const key of allowed) {
    const value = source.get(key);
    if (value && value.length <= 120) query.set(key, value);
  }
  const prefix = HASH_PREFIXES[path];
  const hash = prefix && location.hash?.startsWith(prefix) &&
    /^#[A-Za-z0-9-]{1,100}$/.test(location.hash) ? location.hash : "";
  return `${path}${query.size ? `?${query}` : ""}${hash}`;
}
