const { CSV_COLUMNS, reportRowValues } = require("./portfolioReportService");

const safeExcelValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return String(value).replace(/^[\s\u0000-\u001f]*([=+\-@])/u, "'$&").replace(/\u0000/g, "");
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
  return workbook.xlsx.writeBuffer();
};

module.exports = { reportToXlsx };
