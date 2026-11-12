const { CSV_COLUMNS, reportRowValues } = require("./portfolioReportService");

const safeExcelValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return String(value).replace(/^[\s\u0000-\u001f]*([=+\-@])/u, "'$&").replace(/\u0000/g, "");
};

const addBiTable = (workbook, sheetName, tableName, headers, rows) => {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ width: Math.min(32, Math.max(16, header.length + 3)) }));
  sheet.addTable({ name: tableName, ref: "A1", headerRow: true, totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((name) => ({ name })), rows: rows.map((row) => row.map(safeExcelValue)) });
};

const reportToXlsx = async (report) => {
  // Load on demand so the API can start even when the optional export is unused.
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VERA";
  workbook.subject = "Portafolio visible para la cuenta autenticada";
  workbook.created = new Date(report.asOf);

  const summary = workbook.addWorksheet("Resumen");
  summary.columns = [{ width: 30 }, { width: 48 }];
  summary.addRows([
    ["Reporte de portafolio", "VERA"],
    ["Generado", report.asOf],
    ["Alcance", report.scope],
    ["Auditorías", report.indicators.audits],
    ["Riesgos", report.indicators.risks],
    ["Controles", report.indicators.controls],
    ["Hallazgos", report.indicators.findings],
    ["Evidencias", report.indicators.evidence],
    ["Horas planeadas", report.indicators.plannedHours],
    ["Horas ejecutadas", report.indicators.executedHours],
    ...Object.entries(report.filters).filter(([, value]) => value !== "").map(([key, value]) => [
      `Filtro: ${key}`, safeExcelValue(value)
    ])
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF143A48" } };
  summary.getColumn(1).font = { bold: true, color: { argb: "FF143A48" } };

  const sheet = workbook.addWorksheet("Auditorías", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = CSV_COLUMNS.map((header) => ({ header, width: Math.min(40, Math.max(16, header.length + 3)) }));
  for (const row of report.rows) sheet.addRow(reportRowValues(row).map(safeExcelValue));
  sheet.autoFilter = { from: "A1", to: "T1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF143A48" } };

  addBiTable(workbook, "BI_Audits", "VERA_Audits", [
    "audit_id", "title", "status", "area", "org_unit_id", "type", "responsible_id",
    "quarter", "year", "start_date", "end_date", "risk", "progress_pct",
    "planned_hours", "executed_hours"
  ], report.rows.map(({ audit }) => [
    audit.id, audit.title, audit.status, audit.area, audit.orgUnitId, audit.type,
    audit.responsibleId, audit.quarter, audit.year, audit.startDate, audit.endDate,
    audit.risk, audit.progress, audit.plannedHours, audit.executedHours
  ]));
  const relations = [
    ["BI_Risks", "VERA_Risks", ["audit_id", "risk_id", "title", "level"], "risks",
      (auditId, item) => [auditId, item.id, item.title, item.level]],
    ["BI_Controls", "VERA_Controls", ["audit_id", "control_id", "title", "effectiveness"], "controls",
      (auditId, item) => [auditId, item.id, item.title, item.effectiveness]],
    ["BI_Findings", "VERA_Findings", ["audit_id", "finding_id", "title", "status"], "findings",
      (auditId, item) => [auditId, item.id, item.title, item.status]],
    ["BI_Evidence", "VERA_Evidence", ["audit_id", "evidence_id", "title", "entity_type", "created_at"], "evidence",
      (auditId, item) => [auditId, item.id, item.title, item.entityType, item.createdAt]]
  ];
  for (const [sheetName, tableName, headers, field, project] of relations) {
    addBiTable(workbook, sheetName, tableName, headers,
      report.rows.flatMap((row) => (row[field] || []).map((item) => project(row.audit.id, item))));
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = { reportToXlsx };
