const COLUMNS = ["ID auditoría", "Título", "Estado", "Área", "Unidad ID", "Tipo", "Objetivo", "Responsable",
  "Trimestre", "Año", "Inicio", "Fin", "Riesgo", "Avance %", "Riesgos vinculados",
  "Controles vinculados", "Hallazgos vinculados", "Evidencias vinculadas", "Horas planeadas", "Horas ejecutadas"];

const safeCell = (value) => {
  const text = String(value ?? "").split(String.fromCharCode(0)).join("");
  let first = 0;
  while (first < text.length && (/\s/u.test(text[first]) || text.charCodeAt(first) <= 31)) first += 1;
  const safe = "=+-@".includes(text[first]) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const titles = (items) => (items || []).map((item) => `${item.id}: ${item.title}`).join("; ");

export const filterOfflineReport = (rows, filters) => rows.filter(({ audit }) =>
  (!filters.year || String(audit.year) === filters.year)
  && (!filters.quarter || audit.quarter === filters.quarter)
  && (!filters.status || audit.status === filters.status)
  && (!filters.orgUnitId || String(audit.orgUnitId) === filters.orgUnitId)
  && (!filters.responsible || audit.responsible === filters.responsible));

export const offlineReportIndicators = (rows) => {
  const count = (field) => new Set(rows.flatMap((row) => (row[field] || []).map((item) => item.id))).size;
  const hours = (field) => Number(rows.reduce((sum, row) => sum + (Number(row.audit[field]) || 0), 0).toFixed(2));
  return { audits: rows.length, risks: count("risks"), controls: count("controls"),
    findings: count("findings"), evidence: count("evidence"),
    plannedHours: hours("plannedHours"), executedHours: hours("executedHours") };
};

export const offlineReportToCsv = (rows) => {
  const lines = [COLUMNS.map(safeCell).join(",")];
  for (const row of rows) {
    const { audit } = row;
    lines.push([audit.id, audit.title, audit.status, audit.area, audit.orgUnitId, audit.type,
      audit.objective, audit.responsible, audit.quarter, audit.year, audit.startDate, audit.endDate,
      audit.risk, audit.progress, titles(row.risks), titles(row.controls), titles(row.findings),
      titles(row.evidence), audit.plannedHours, audit.executedHours].map(safeCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

export const downloadOfflineReportCsv = (rows) => {
  const blob = new Blob([offlineReportToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "vera-informe-local.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
