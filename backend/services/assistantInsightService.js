const { sourceFor } = require("./assistantContextService");

const MAX_INSIGHTS = 6;
const finiteScore = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const short = (value) => String(value ?? "").slice(0, 160);

// This is an attention ranking, never a calculated residual risk or a recommendation to change data.
const buildDecisionInsights = ({ visibleRecords, asOf = new Date().toISOString() }) => {
  const { audits = [], risks = [], controls = [], findings = [], pending = [] } = visibleRecords;
  const now = Date.parse(asOf);
  const candidates = [];
  const visibleRiskIds = new Set(risks.map((risk) => risk.id));

  for (const risk of risks) {
    const relatedControls = controls.filter((control) => Array.isArray(control.riskIds) && control.riskIds.includes(risk.id));
    const weakControls = relatedControls.filter((control) => finiteScore(control.effectiveness) < 4);
    const openFindings = findings.filter((finding) =>
      finding.riskId === risk.id && ["OPEN", "PENDING_CLOSURE"].includes(finding.status));
    if (risk.level !== "Alto" && weakControls.length === 0 && openFindings.length === 0) continue;
    const factors = [
      `Nivel registrado: ${short(risk.level || "sin evaluar")}`,
      `Puntaje registrado: ${finiteScore(risk.score)}`,
      `Controles por revisar: ${weakControls.length}`,
      `Hallazgos abiertos: ${openFindings.length}`
    ];
    const score = Math.min(100, finiteScore(risk.score) * 10 + weakControls.length * 15 + openFindings.length * 10);
    candidates.push({ key: `risk:${risk.id}`, title: short(risk.title), kind: "risk", score,
      priority: score >= 70 ? "HIGH" : "MEDIUM", reason: "Riesgo registrado con señales que requieren revisión.",
      factors, source: sourceFor("risks", risk) });
  }

  for (const audit of audits) {
    if (audit.status !== "ACTIVE" || !audit.endDate) continue;
    const deadline = Date.parse(`${audit.endDate}T23:59:59.999Z`);
    if (!Number.isFinite(deadline) || !Number.isFinite(now)) continue;
    const days = Math.ceil((deadline - now) / 86400000);
    if (days > 14) continue;
    const progress = Math.min(100, finiteScore(audit.progress));
    const score = Math.min(100, (days < 0 ? 80 : 55) + (progress < 50 ? 15 : 0));
    candidates.push({ key: `audit:${audit.id}`, title: short(audit.title), kind: "audit", score,
      priority: score >= 70 ? "HIGH" : "MEDIUM",
      reason: days < 0 ? "Auditoría activa con fecha objetivo vencida." : "Auditoría activa próxima a su fecha objetivo.",
      factors: [`Días hasta fecha objetivo: ${days}`, `Avance registrado: ${progress}%`],
      source: sourceFor("audits", audit) });
  }

  for (const control of controls) {
    if (finiteScore(control.effectiveness) >= 4) continue;
    const linked = Array.isArray(control.riskIds) ? control.riskIds.filter((id) => visibleRiskIds.has(id)) : [];
    if (linked.length === 0) continue;
    const score = Math.min(90, 50 + linked.length * 8 + (finiteScore(control.effectiveness) <= 2 ? 15 : 0));
    candidates.push({ key: `control:${control.id}`, title: short(control.title), kind: "control", score,
      priority: score >= 70 ? "HIGH" : "MEDIUM", reason: "Control asociado a riesgos visibles que requiere evaluación.",
      factors: [`Efectividad registrada: ${finiteScore(control.effectiveness)}/5`, `Riesgos visibles relacionados: ${linked.length}`],
      source: sourceFor("controls", control) });
  }

  for (const item of pending) {
    if (item.priority !== "HIGH") continue;
    candidates.push({ key: `pending:${item.id}`, title: short(item.title), kind: "pending", score: 75,
      priority: "HIGH", reason: "Actividad marcada como prioritaria para tu cuenta.",
      factors: [`Tipo de actividad: ${short(item.type || "pendiente")}`], source: sourceFor("pending", item) });
  }

  const insights = candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, MAX_INSIGHTS);
  return { asOf, method: "rule-based-attention-v1", evaluated: candidates.length, totalShown: insights.length,
    partial: candidates.length > MAX_INSIGHTS, insights };
};

module.exports = { buildDecisionInsights };
