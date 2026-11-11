const { buildAssistantContext, sourceFor } = require("./assistantContextService");

const PAGE_SIZE = 10;
const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();

const TYPES = [
  { key: "audits", match: /\bauditori(?:a|as)\b|\bpropuest(?:a|as)\b/, name: "auditorías" },
  { key: "risks", match: /\briesg(?:o|os)\b/, name: "riesgos" },
  { key: "controls", match: /\bcontrol(?:es)?\b/, name: "controles" },
  { key: "findings", match: /\bhallazg(?:o|os)\b/, name: "hallazgos" },
  { key: "pending", match: /\bpendient(?:e|es)\b|\bactividades\b/, name: "pendientes" }
];
const FILTERS = { audits: [null, "active", "open", "rejected"], risks: [null, "high"],
  controls: [null, "review"], findings: [null, "open"], pending: [null, "urgent"] };

const parseBrowse = (question, previous = null) => {
  const text = normalize(question);
  if (/^(siguientes|mas resultados|muestra mas|ver mas|continua|continuar)$/.test(text)) {
    return previous?.hasMore === true && FILTERS[previous.type]?.includes(previous.filter) &&
      Number.isSafeInteger(previous.offset) && previous.offset >= 0 && previous.offset <= 10000
      ? { type: previous.type, filter: previous.filter, offset: previous.offset + PAGE_SIZE }
      : null;
  }
  if (!/^(?:muestrame|mostrar|ensename|lista|listar|dame|ver|busca|encuentra|cuales son|quiero ver)\b/.test(text)) return null;
  const type = TYPES.map((item) => ({ ...item, position: text.search(item.match) }))
    .filter((item) => item.position >= 0).sort((a, b) => a.position - b.position)[0];
  if (!type) return null;
  const filter = type.key === "audits" && /\bactiv(?:a|as)\b/.test(text) ? "active"
    : type.key === "audits" && /\babiert(?:a|as)\b/.test(text) ? "open"
    : type.key === "audits" && /\brechazad(?:a|as)\b/.test(text) ? "rejected"
      : type.key === "risks" && /\balt(?:o|os)\b/.test(text) ? "high"
        : type.key === "controls" && /\binefectiv|por revisar/.test(text) ? "review"
          : type.key === "findings" && /\babiert(?:o|os)\b/.test(text) ? "open"
            : type.key === "pending" && /\burgent|prioritari/.test(text) ? "urgent" : null;
  return { type: type.key, filter, offset: 0 };
};

const matches = (type, filter, item) => {
  if (!filter) return true;
  if (type === "audits") return item.status === ({ active: "ACTIVE", open: "OPEN", rejected: "REJECTED" }[filter]);
  if (type === "risks") return item.level === "Alto";
  if (type === "controls") return item.effectiveness !== null && item.effectiveness !== undefined &&
    Number.isFinite(Number(item.effectiveness)) && Number(item.effectiveness) < 4;
  if (type === "findings") return ["OPEN", "PENDING_CLOSURE"].includes(item.status);
  if (type === "pending") return item.priority === "HIGH";
  return false;
};

const browseAssistant = async (user, question, focus = null, previous = null) => {
  const intent = parseBrowse(question, previous);
  if (!intent) return null;
  const { visibleRecords, coverage, asOf } = await buildAssistantContext(user, question, focus);
  const type = TYPES.find((item) => item.key === intent.type);
  const name = intent.type === "audits" && intent.filter === "open" ? "propuestas abiertas"
    : intent.type === "audits" && intent.filter === "rejected" ? "propuestas rechazadas" : type.name;
  const rows = visibleRecords[intent.type].filter((item) => matches(intent.type, intent.filter, item));
  const offset = Math.min(intent.offset, rows.length);
  const items = rows.slice(offset, offset + PAGE_SIZE).map((item) => sourceFor(intent.type, item));
  const hasMore = offset + items.length < rows.length;
  const incompletePending = intent.type === "pending" && coverage.pendingActionsUnavailable;
  const answer = rows.length === 0
    ? `No encontré ${name} con ese filtro en tu alcance actual.`
    : `Encontré ${rows.length} ${name} en tu alcance. Muestro ${offset + 1}–${offset + items.length} de ${rows.length}.${hasMore ? " Escribe «siguientes» para continuar." : ""}`;
  const note = incompletePending ? " Los compromisos no estuvieron disponibles; esta lista puede estar incompleta." : "";
  return { answer: answer + note, mode: "browse", citations: [], references: [],
    coverage: { partial: hasMore || incompletePending, pendingActionsUnavailable: incompletePending },
    asOf, usage: null, browse: { ...intent, total: rows.length, hasMore, items } };
};

module.exports = { browseAssistant, parseBrowse, PAGE_SIZE };
