#!/usr/bin/env node
"use strict";

// Dataset sintético determinista: mide el render PDF, no la consulta a Supabase ni la red.
const { performance } = require("node:perf_hooks");
const { PDFDocument } = require("pdf-lib");
const { reportToPdf } = require("../services/portfolioPdfService");

const rowCount = Number(process.argv[2] ?? 300);
if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 5000) {
  process.stderr.write("Uso: node scripts/benchmark-portfolio-pdf.js [1..5000 auditorías]\n");
  process.exit(2);
}
const rows = Array.from({ length: rowCount }, (_, index) => {
  const id = String(index + 1).padStart(5, "0");
  return {
    audit: { id: `AUD-${id}`, title: `Revisión de operación ${id}`, status: "ACTIVE",
      area: "Operaciones", responsible: "Persona de prueba", year: 2026, quarter: "Q4",
      plannedHours: 40, executedHours: 18, progress: 45,
      objective: "Verificar el proceso, sus riesgos y las acciones de control documentadas." },
    risks: [{ id: `R-${id}`, title: "Riesgo operativo evaluado", level: "Medio" }],
    controls: [{ id: `C-${id}`, title: "Control periódico de supervisión", effectiveness: "Efectivo" }],
    findings: [{ id: `H-${id}`, title: "Hallazgo documentado", status: "OPEN" }],
    evidence: [{ id: `E-${id}`, title: "Acta de revisión", entityType: "AUDIT" }]
  };
});
const report = {
  asOf: "2026-11-10T00:00:00.000Z", scope: "Datos sintéticos de rendimiento",
  filters: { year: "2026", quarter: "Q4" }, total: rowCount,
  indicators: { audits: rowCount, risks: rowCount, controls: rowCount,
    findings: rowCount, evidence: rowCount, plannedHours: rowCount * 40,
    executedHours: rowCount * 18, auditsWithPlannedHours: rowCount,
    auditsWithExecutedHours: rowCount }, rows
};

(async () => {
  const start = performance.now();
  const bytes = await reportToPdf(report);
  const durationMs = Math.round(performance.now() - start);
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  process.stdout.write(JSON.stringify({ node: process.version, rowCount, pages, durationMs, bytes: bytes.length,
    scope: "solo generación PDF local, sin consulta a Supabase ni transferencia" }) + "\n");
  if (rowCount === 300 && pages !== 100) throw new Error(`El conjunto de referencia debe producir 100 páginas; produjo ${pages}.`);
  if (pages <= 100 && durationMs > 10000) throw new Error(`La generación excedió 10 segundos: ${durationMs} ms.`);
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
