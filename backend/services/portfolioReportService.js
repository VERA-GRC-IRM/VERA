const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const { ROLES } = require("../config/roles");
const { relateAudit } = require("./auditContextService");
const { searchAudits } = require("./auditSearch");
const { filterByVisibleScope, projectVisibleRiskRelations } = require("./recordScopeVisibility");

const buildPortfolioReport = async (user, filters) => {
  if (!Object.values(ROLES).includes(user.role)) {
    const error = new Error("Este rol no tiene acceso a reportes.");
    error.status = 403;
    throw error;
  }
  const [allAudits, allRisks, allControls, allFindings, allEvidence] = await Promise.all([
    planningRepository.getAll(), riskRepository.getAll(), controlRepository.getAll(),
    findingRepository.getAll(), evidenceRepository.getAll()
  ]);
  const auditor = user.role === ROLES.AUDITOR;
  const scopedAudits = await filterByVisibleScope(user, allAudits);
  const audits = searchAudits(auditor
    ? scopedAudits.filter((audit) => audit.responsibleId === user.id) : scopedAudits, filters);
  const { risks, controls, findings } = await projectVisibleRiskRelations(
    user, allRisks, allControls, allFindings);
  const riskIds = new Set(risks.map((risk) => risk.id));
  const controlIds = new Set(controls.map((control) => control.id));
  const evidence = auditor ? allEvidence.filter((item) =>
    (item.entityType === "AUDIT" && audits.some((audit) => audit.id === item.entityId)) ||
    (item.entityType === "RISK" && riskIds.has(item.entityId)) ||
    (item.entityType === "CONTROL" && controlIds.has(item.entityId))) : allEvidence;

  const rows = audits.map((audit) => {
    const related = relateAudit(audit.id, { risks, controls, findings, evidence });
    return {
      audit: {
        id: audit.id, title: audit.title, status: audit.status, area: audit.area,
        type: audit.type, objective: audit.objective, responsible: audit.responsible,
        quarter: audit.quarter, year: audit.year, startDate: audit.startDate,
        endDate: audit.endDate, risk: audit.risk, progress: audit.progress
      },
      risks: related.risks.map(({ id, title, level }) => ({ id, title, level })),
      controls: related.controls.map(({ id, title, effectiveness }) => ({ id, title, effectiveness })),
      findings: related.findings.map(({ id, title, status }) => ({ id, title, status })),
      evidenceCount: related.evidence.length
    };
  });
  return {
    asOf: new Date().toISOString(),
    scope: auditor ? "Expedientes asignados y relaciones visibles para tu cuenta" : "Portafolio visible para tu rol",
    filters: Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value || ""])),
    total: rows.length,
    rows
  };
};

const CSV_COLUMNS = ["ID auditoría", "Título", "Estado", "Área", "Tipo", "Objetivo", "Responsable",
  "Trimestre", "Año", "Inicio", "Fin", "Riesgo", "Avance %", "Riesgos vinculados",
  "Controles vinculados", "Hallazgos vinculados", "Evidencias vinculadas"];
const safeCell = (value) => {
  const text = String(value ?? "").replace(/^[\s\u0000-\u001f]*([=+\-@])/u, "'$&").replace(/\u0000/g, "");
  return `"${text.replace(/"/g, '""')}"`;
};
const listTitles = (items) => items.map((item) => `${item.id}: ${item.title}`).join("; ");
const reportToCsv = (report) => {
  const lines = [CSV_COLUMNS.map(safeCell).join(",")];
  for (const { audit, risks, controls, findings, evidenceCount } of report.rows) {
    lines.push([
      audit.id, audit.title, audit.status, audit.area, audit.type, audit.objective,
      audit.responsible, audit.quarter, audit.year, audit.startDate, audit.endDate,
      audit.risk, audit.progress, listTitles(risks), listTitles(controls),
      listTitles(findings), evidenceCount
    ].map(safeCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

module.exports = { buildPortfolioReport, reportToCsv };
