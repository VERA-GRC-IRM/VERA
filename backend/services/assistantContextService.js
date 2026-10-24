const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { ROLES } = require("../config/roles");
const { buildNotifications } = require("./notificationService");
const { listActions } = require("./actionService");
const { filterByVisibleScope, projectVisibleRiskRelations,
  projectVisibleAuditLinks } = require("./recordScopeVisibility");

const LIMIT_PER_TYPE = 20;
const clean = (value, limit = 160) => String(value ?? "").slice(0, limit);
const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const STOP_WORDS = new Set([
  "que", "cual", "cuales", "como", "para", "con", "del", "los", "las", "por", "una", "uno",
  "mis", "este", "esta", "estos", "estas", "hay", "son", "sobre", "dame", "muestra", "resume"
]);
const termsFor = (question) => [...new Set((normalize(question).match(/[\p{L}\p{N}]{3,}/gu) || [])
  .filter((word) => !STOP_WORDS.has(word))
  .map((word) => word.length > 4 && word.endsWith("es") ? word.slice(0, -2)
    : word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))];
const factsFor = (type, item) => {
  const fields = {
    audits: [["Estado", item.status], ["Área", item.area], ["Avance", Number.isFinite(item.progress) ? `${item.progress}%` : null]],
    risks: [["Nivel", item.level], ["Puntaje", item.score]],
    controls: [["Efectividad", item.effectiveness]],
    findings: [["Estado", item.status]],
    pending: [["Prioridad", item.priority], ["Detalle", item.description], ["Vence", item.dueAt]]
  }[type] || [];
  return fields.filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: clean(value, 80) }));
};
const sourceFor = (type, item) => {
  const label = { audits: "Auditoría", risks: "Riesgo", controls: "Control",
    findings: "Hallazgo", pending: "Pendiente" }[type];
  const path = type === "audits"
    ? (item.status === "ACTIVE" ? `/auditorias-activas/${encodeURIComponent(item.id)}` : "/planificacion")
    : { risks: `/riesgos#risk-${encodeURIComponent(item.id)}`,
      controls: `/controles#control-${encodeURIComponent(item.id)}`,
      findings: `/controles#finding-${encodeURIComponent(item.id)}`,
      pending: item.path || "/notificaciones" }[type];
  return { sourceId: `${type}:${item.id}`, type: label, id: item.id, title: item.title, path,
    facts: factsFor(type, item) };
};

const rankAssistantRecords = (type, items, question, preferred = new Set()) => {
  const query = normalize(question);
  const words = termsFor(question);
  const high = /\b(alt[oa]s?|critic[oa]s?)\b/.test(query);
  const active = /\bactiv[oa]s?\b/.test(query);
  const open = /\babiert[oa]s?\b/.test(query);
  const ineffective = /inefectiv|ineficaz|por revisar/.test(query);
  const urgent = /urgent|prioritari/.test(query);
  return items.map((item, index) => {
    const title = normalize(item.title);
    const searchable = normalize(JSON.stringify(item));
    const id = normalize(item.id ?? "");
    const score = (preferred.has(item.id) ? 1000 : 0) +
      (id.length >= 3 && query.includes(id) ? 100 : 0) +
      words.reduce((total, word) => total + (title.includes(word) ? 4 : searchable.includes(word) ? 2 : 0), 0) +
      (type === "risks" && high && item.level === "Alto" ? 50 : 0) +
      (type === "audits" && active && item.status === "ACTIVE" ? 50 : 0) +
      (type === "findings" && open && item.status === "OPEN" ? 50 : 0) +
      (type === "controls" && ineffective && Number(item.effectiveness) < 4 ? 50 : 0) +
      (type === "pending" && urgent && item.priority === "HIGH" ? 50 : 0);
    return { item, index, score };
  })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, LIMIT_PER_TYPE)
    .map(({ item }) => item);
};

const buildAssistantContext = async (user, question, focus = null) => {
  if (!Object.values(ROLES).includes(user.role)) {
    const error = new Error("Este rol no tiene acceso al asistente.");
    error.status = 403;
    throw error;
  }
  if (focus && (!new Set(["audit", "risk", "control", "finding"]).has(focus.type) ||
      typeof focus.id !== "string" || !focus.id.trim() || focus.id.length > 80)) {
    const error = new Error("Selecciona un expediente válido.");
    error.status = 400;
    throw error;
  }
  const [allAudits, allRisks, allControls, allFindings] = await Promise.all([
    planningRepository.getAll(), riskRepository.getAll(), controlRepository.getAll(), findingRepository.getAll()
  ]);
  const auditor = user.role === "AUDITOR";
  const scopedAudits = await filterByVisibleScope(user, allAudits);
  const audits = auditor ? scopedAudits.filter((item) => item.responsibleId === user.id) : scopedAudits;
  const { risks: scopedRisks, controls, findings } = await projectVisibleRiskRelations(
    user, allRisks, allControls, allFindings);
  const risks = projectVisibleAuditLinks(scopedRisks, audits);
  const riskIds = new Set(risks.map((item) => item.id));
  let actions = [];
  let pendingActionsAvailable = true;
  try { actions = await listActions(user); }
  catch { pendingActionsAvailable = false; }
  const allowedActionSources = {
    AUDIT: new Set(audits.map((item) => item.id)),
    RISK: riskIds,
    CONTROL: new Set(controls.map((item) => item.id)),
    FINDING: new Set(findings.map((item) => item.id))
  };
  actions = actions.filter((item) => allowedActionSources[item.sourceType]?.has(item.sourceId));
  const notifications = buildNotifications({ proposals: audits, actions, user });
  // Este alcance coincide con los endpoints de lectura de cada módulo. El
  // expediente se resuelve después de filtrar, para no revelar su existencia.
  const visibleByType = { audit: audits, risk: risks, control: controls, finding: findings };
  const focused = focus ? visibleByType[focus.type].find((item) => item.id === focus.id) : null;
  if (focus && !focused) {
    const error = new Error("El expediente no existe o no está disponible para tu cuenta.");
    error.status = 404;
    throw error;
  }
  const preferred = {
    audits: new Set(), risks: new Set(), controls: new Set(),
    findings: new Set(), pending: new Set()
  };
  if (focus) {
    const type = { audit: "audits", risk: "risks", control: "controls", finding: "findings" }[focus.type];
    preferred[type].add(focus.id);
    if (focus.type === "audit") risks.filter((item) => item.linkedAuditId === focus.id)
      .forEach((item) => preferred.risks.add(item.id));
    if (focus.type === "risk") {
      if (focused.linkedAuditId) preferred.audits.add(focused.linkedAuditId);
      controls.filter((item) => item.riskIds.includes(focus.id))
        .forEach((item) => preferred.controls.add(item.id));
      findings.filter((item) => item.riskId === focus.id)
        .forEach((item) => preferred.findings.add(item.id));
    }
    if (focus.type === "control") focused.riskIds.forEach((id) => preferred.risks.add(id));
    if (focus.type === "finding") {
      preferred.risks.add(focused.riskId);
      preferred.controls.add(focused.controlId);
    }
  }

  const records = {
    audits: audits.map((item) => ({ id: clean(item.id, 50), title: clean(item.title), status: item.status,
      area: clean(item.area, 80), risk: item.risk, progress: item.progress ?? 0 })),
    risks: risks.map((item) => ({ id: clean(item.id, 50), title: clean(item.title), level: item.level,
      score: item.score, linkedAuditId: item.linkedAuditId || null })),
    controls: controls.map((item) => ({ id: clean(item.id, 50), title: clean(item.title),
      riskIds: item.riskIds.filter((id) => riskIds.has(id)), effectiveness: item.effectiveness })),
    findings: findings.map((item) => ({ id: clean(item.id, 50), title: clean(item.title),
      riskId: item.riskId, controlId: item.controlId, status: item.status })),
    pending: notifications.map((item) => ({ id: clean(item.id, 80), title: clean(item.title),
      entityId: item.entityId, priority: item.priority }))
  };

  const selected = Object.fromEntries(Object.entries(records).map(([type, items]) =>
    [type, rankAssistantRecords(type, items, question, preferred[type])]));
  const selection = Object.fromEntries(Object.entries(records).map(([type, items]) =>
    [type, { visible: items.length, included: selected[type].length }]));
  const query = normalize(question);
  const requested = {
    audits: /auditor|propuest|portafolio/.test(query),
    risks: /riesg/.test(query),
    controls: /control/.test(query),
    findings: /hallazg/.test(query),
    pending: /pendient|actividad|tarea/.test(query)
  };
  const relevantTypes = Object.keys(requested).filter((type) => requested[type] || preferred[type].size > 0);
  const coverageTypes = relevantTypes.length ? relevantTypes : Object.keys(selection);
  const sourceCatalog = Object.entries(selected).flatMap(([type, items]) =>
    items.map((item) => sourceFor(type, item)));
  const references = Object.entries(selected).flatMap(([type, items]) =>
    items.filter((item) => requested[type] || preferred[type].has(item.id))
      .slice(0, 5).map((item) => sourceFor(type, item))).slice(0, 15);
  const brief = [
    { key: "highRisks", label: "Riesgos altos", count: risks.filter((item) => item.level === "Alto").length, path: "/riesgos" },
    { key: "ineffectiveControls", label: "Controles por revisar", count: controls.filter((item) => Number(item.effectiveness) < 4).length, path: "/controles" },
    { key: "openFindings", label: "Hallazgos abiertos", count: findings.filter((item) => item.status === "OPEN").length, path: "/controles" },
    { key: "urgentPending", label: "Pendientes prioritarios", count: notifications.filter((item) => item.priority === "HIGH").length, path: "/notificaciones" },
    { key: "activeAudits", label: "Auditorías activas", count: audits.filter((item) => item.status === "ACTIVE").length, path: "/auditorias-activas" }
  ];

  return {
    context: {
      role: user.role,
      pendingActionsAvailable,
      scope: auditor ? "Solo auditorías asignadas y riesgos bajo responsabilidad del usuario" : "Portafolio completo según los módulos de lectura actuales",
      counts: Object.fromEntries(Object.entries(records).map(([type, items]) => [type, items.length])),
      selection,
      sampleLimitPerType: LIMIT_PER_TYPE,
      focus: focused ? { type: focus.type, id: focus.id, title: clean(focused.title),
        description: clean(focused.description, 700), objective: clean(focused.objective, 500),
        responsePlan: clean(focused.responsePlan, 500), status: focused.status,
        level: focused.level, score: focused.score,
        linkedAuditId: focused.linkedAuditId || null,
        riskIds: Array.isArray(focused.riskIds) ? focused.riskIds.filter((id) => riskIds.has(id)) : [],
        evaluations: Array.isArray(focused.evaluations) ? focused.evaluations.slice(-3).map((item) => ({
          score: item.score, level: item.level, rating: item.rating,
          date: item.assessedAt || item.createdAt || null
        })) : [] } : null,
      sources: sourceCatalog.map(({ sourceId, type, id, title }) => ({ sourceId, type, id, title })),
      records: selected
    },
    references, sourceCatalog, brief,
    // Solo para composición del lado del servidor; las rutas no envían estos objetos completos al navegador ni a Azure.
    visibleRecords: { audits, risks, controls, findings, pending: notifications },
    verifiedData: { risks: risks.map((item) => ({ area: clean(item.area, 100), level: item.level })) },
    asOf: new Date().toISOString(),
    coverage: { partial: coverageTypes.some((type) => selection[type].included < selection[type].visible) ||
      (requested.pending && !pendingActionsAvailable), selection,
    pendingActionsUnavailable: !pendingActionsAvailable }
  };
};

module.exports = { buildAssistantContext, rankAssistantRecords, sourceFor };
