const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { PDFDocument } = require("pdf-lib");
const ExcelJS = require("exceljs");

process.env.JWT_SECRET ||= "portfolio-report-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { reportToCsv } = require("../services/portfolioReportService");
const { reportToPdf } = require("../services/portfolioPdfService");

const pdfText = async (bytes) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    pages.push((await (await document.getPage(index)).getTextContent()).items.map((item) => item.str).join(" "));
  }
  return pages.join(" ");
};

const auth = (id, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("RF-29: report includes linked facts and filtered CSV with UTF-8 headings", async (context) => {
  const base = await startTestServer(context, app);
  const title = `Reporte regional ${Date.now()}`;
  const proposalResponse = await fetch(`${base}/api/planning`, auth(3, "POST", {
    title, objective: "Verificar la operación del proceso regional.", scope: "Operación regional.",
    justification: "Se requiere seguimiento de los controles.", area: "Operaciones",
    quarter: "Q4", year: 2026, responsibleId: 5, plannedHours: 40
  }));
  assert.equal(proposalResponse.status, 201);
  const proposal = (await proposalResponse.json()).proposal;
  assert.equal(proposal.plannedHours, 40);
  assert.equal((await fetch(`${base}/api/planning/${proposal.id}/approve`, auth(3, "POST", { quarter: "Q4" }))).status, 200);
  assert.equal((await fetch(`${base}/api/planning/${proposal.id}/start`, auth(3, "POST", {}))).status, 200);
  const hoursUpdate = await fetch(`${base}/api/planning/${proposal.id}/details`, auth(3, "PATCH", { executedHours: 12.5 }));
  assert.equal(hoursUpdate.status, 200);
  const riskResponse = await fetch(`${base}/api/risks`, auth(3, "POST", {
    title: `Riesgo de reporte ${Date.now()}`, description: "La falta de control puede generar incidencias.",
    area: "Operaciones", ownerId: 5, linkedAuditId: proposal.id, likelihood: 3, impact: 2,
    note: "Se detectó una exposición durante la revisión reciente."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, auth(3, "POST", {
    title: `Control regional ${Date.now()}`, description: "Revisión mensual por un responsable designado.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, riskIds: [risk.id], rating: 2,
    note: "La muestra presentó excepciones sin resolver."
  }));
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const findingResponse = await fetch(`${base}/api/findings`, auth(3, "POST", {
    controlId: control.id, riskId: risk.id, title: "Excepción regional",
    description: "Se identificó una excepción durante la revisión.",
    rootCause: "El procedimiento no registra la segunda revisión requerida.", severity: "MEDIUM"
  }));
  assert.equal(findingResponse.status, 201);

  const query = `q=${encodeURIComponent(proposal.id)}`;
  const response = await fetch(`${base}/api/planning/report?${query}`, auth(3));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const report = await response.json();
  assert.equal(report.total, 1);
  assert.equal(report.rows[0].audit.id, proposal.id);
  assert.deepEqual(report.rows[0].risks.map((item) => item.id), [risk.id]);
  assert.deepEqual(report.rows[0].controls.map((item) => item.id), [control.id]);
  assert.equal(report.rows[0].findings.length, 1);
  assert.equal(report.rows[0].audit.plannedHours, 40);
  assert.equal(report.rows[0].audit.executedHours, 12.5);
  assert.equal(report.indicators.plannedHours, 40);
  assert.equal(report.indicators.executedHours, 12.5);
  assert.equal(report.indicators.auditsWithExecutedHours, 1);
  assert.equal(report.indicators.risks, 1);
  assert.equal(report.indicators.controls, 1);
  assert.equal(report.indicators.findings, 1);
  const assignedReport = await fetch(`${base}/api/planning/report?${query}`, auth(5));
  assert.equal(assignedReport.status, 200);
  assert.deepEqual((await assignedReport.json()).rows[0].risks.map((item) => item.id), [risk.id]);
  const csvResponse = await fetch(`${base}/api/planning/report?${query}&format=csv`, auth(3));
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get("content-type"), /text\/csv/);
  assert.match(csvResponse.headers.get("content-disposition"), /attachment/);
  const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(csvBytes);
  for (const value of [proposal.id, risk.id, control.id, "Excepción regional", '"40"', '"12.5"']) assert.ok(csv.includes(value));
  const excelResponse = await fetch(`${base}/api/planning/report?${query}&format=xlsx`, auth(3));
  assert.equal(excelResponse.status, 200);
  assert.match(excelResponse.headers.get("content-type"), /spreadsheetml\.sheet/);
  assert.equal(excelResponse.headers.get("cache-control"), "no-store");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excelResponse.arrayBuffer()));
  assert.equal(workbook.getWorksheet("Resumen").getCell("B4").value, 1);
  const excelRows = workbook.getWorksheet("Auditorías");
  assert.equal(excelRows.rowCount, 2);
  assert.equal(excelRows.getCell("A2").value, proposal.id);
  assert.equal(excelRows.getCell("S2").value, 40);
  assert.equal(excelRows.getCell("T2").value, 12.5);
  assert.ok(excelRows.getCell("O2").value.includes(risk.id));
  assert.equal(workbook.getWorksheet("BI_Audits").getCell("A2").value, proposal.id);
  assert.equal(workbook.getWorksheet("BI_Risks").getCell("B2").value, risk.id);
  assert.equal(workbook.getWorksheet("BI_Controls").getCell("B2").value, control.id);
  assert.equal(workbook.getWorksheet("BI_Findings").getCell("B2").value,
    report.rows[0].findings[0].id);
  assert.equal(workbook.getWorksheet("BI_Audits").getCell("O2").value, 12.5);
  const pdfResponse = await fetch(`${base}/api/planning/report?${query}&format=pdf`, auth(3));
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get("content-type"), /application\/pdf/);
  assert.match(pdfResponse.headers.get("content-disposition"), /attachment/);
  assert.equal(pdfResponse.headers.get("cache-control"), "no-store");
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  const text = await pdfText(pdfBytes);
  for (const value of [proposal.id, risk.id, control.id, "Excepción regional", "Horas planeadas: 40", "ejecutadas: 12.5"]) {
    assert.ok(text.includes(value), `Falta en PDF: ${value}`);
  }
  const filtered = await fetch(`${base}/api/planning/report?year=2026&quarter=Q4&status=ACTIVE&responsibleId=5&q=${encodeURIComponent(proposal.id)}`, auth(3));
  assert.equal(filtered.status, 200);
  assert.equal((await filtered.json()).total, 1);
  const wrongAssignee = await fetch(`${base}/api/planning/report?responsibleId=4&q=${encodeURIComponent(proposal.id)}`, auth(3));
  assert.equal((await wrongAssignee.json()).total, 0);
});

test("RF-29: auditor sees only assigned records; empty and invalid filters are explicit", async (context) => {
  const base = await startTestServer(context, app);
  assert.equal((await fetch(`${base}/api/planning/report`)).status, 401);
  const manager = await fetch(`${base}/api/planning/report`, auth(3));
  const managerReport = await manager.json();
  assert.ok(managerReport.total > 0);
  const auditor = await fetch(`${base}/api/planning/report`, auth(5));
  assert.equal(auditor.status, 200);
  const auditorReport = await auditor.json();
  assert.ok(auditorReport.total <= managerReport.total);
  assert.ok(!auditorReport.rows.some((row) => row.audit.id === "AUD-01"));
  const auditorCsv = await (await fetch(`${base}/api/planning/report?format=csv`, auth(5))).text();
  assert.ok(!auditorCsv.includes("AUD-01"));
  const auditorXlsx = await fetch(`${base}/api/planning/report?format=xlsx`, auth(5));
  assert.equal(auditorXlsx.status, 200);
  const auditorWorkbook = new ExcelJS.Workbook();
  await auditorWorkbook.xlsx.load(Buffer.from(await auditorXlsx.arrayBuffer()));
  assert.ok(!auditorWorkbook.getWorksheet("Auditorías").getColumn(1).values.includes("AUD-01"));
  assert.ok(!auditorWorkbook.getWorksheet("BI_Audits").getColumn(1).values.includes("AUD-01"));
  const auditorPdf = await fetch(`${base}/api/planning/report?format=pdf`, auth(5));
  assert.equal(auditorPdf.status, 200);
  assert.ok(!(await pdfText(Buffer.from(await auditorPdf.arrayBuffer()))).includes("AUD-01"));
  const empty = await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria`, auth(3));
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).total, 0);
  const emptyCsv = await (await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria&format=csv`, auth(3))).text();
  assert.equal(emptyCsv.trim().split("\r\n").length, 1);
  const emptyXlsx = await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria&format=xlsx`, auth(3));
  const emptyWorkbook = new ExcelJS.Workbook();
  await emptyWorkbook.xlsx.load(Buffer.from(await emptyXlsx.arrayBuffer()));
  assert.equal(emptyWorkbook.getWorksheet("Auditorías").rowCount, 1);
  assert.equal(emptyWorkbook.getWorksheet("BI_Audits").rowCount, 1);
  const emptyPdf = await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria&format=pdf`, auth(3));
  assert.equal(emptyPdf.status, 200);
  assert.match(await pdfText(Buffer.from(await emptyPdf.arrayBuffer())), /No hay expedientes visibles/);
  for (const query of ["status=UNKNOWN", "q=x&q=y", "format=xml", "responsibleId=x", "orgUnitId=invalid"]) {
    assert.equal((await fetch(`${base}/api/planning/report?${query}`, auth(3))).status, 400);
  }
});

test("HU-27: unit filter uses stored assignment and hours reject invalid input", async (context) => {
  const base = await startTestServer(context, app);
  const group = await fetch(`${base}/api/org-units`, auth(1, "POST", {
    code: `GR${Date.now().toString().slice(-10)}`, name: "Grupo para reporte", kind: "GROUP"
  }));
  assert.equal(group.status, 201);
  const unit = (await group.json()).unit;
  const proposal = await fetch(`${base}/api/planning`, auth(1, "POST", {
    title: `Reporte por unidad ${Date.now()}`, area: "Operaciones", objective: "Revisar el ámbito.",
    scope: "Unidad seleccionada.", justification: "Comprobar el filtro.", quarter: "Q2", year: 2026,
    orgUnitId: unit.id, plannedHours: 8.25
  }));
  assert.equal(proposal.status, 201);
  const audit = (await proposal.json()).proposal;
  const scoped = await fetch(`${base}/api/planning/report?orgUnitId=${unit.id}&q=${audit.id}`, auth(1));
  assert.equal(scoped.status, 200);
  assert.deepEqual((await scoped.json()).rows.map((row) => row.audit.id), [audit.id]);
  const unitCsv = await (await fetch(`${base}/api/planning/report?orgUnitId=${unit.id}&q=${audit.id}&format=csv`, auth(1))).text();
  assert.ok(unitCsv.includes(unit.id));
  const unitPdf = await fetch(`${base}/api/planning/report?orgUnitId=${unit.id}&q=${audit.id}&format=pdf`, auth(1));
  assert.equal(unitPdf.status, 200);
  assert.ok((await pdfText(Buffer.from(await unitPdf.arrayBuffer()))).includes(unit.id));
  const otherUnit = `ORG-00000000-0000-4000-8000-000000000000`;
  const empty = await fetch(`${base}/api/planning/report?orgUnitId=${otherUnit}&q=${audit.id}`, auth(1));
  assert.equal((await empty.json()).total, 0);
  const badHours = await fetch(`${base}/api/planning`, auth(1, "POST", {
    title: `Horas no válidas ${Date.now()}`, area: "Operaciones", objective: "Revisar horas.",
    scope: "Unidad seleccionada.", justification: "Comprobar validación.", quarter: "Q2", year: 2026,
    orgUnitId: unit.id, plannedHours: -1
  }));
  assert.equal(badHours.status, 400);
});

test("RF-29: CSV quotes values and neutralizes spreadsheet formulas", () => {
  const csv = reportToCsv({ rows: [{
    audit: { id: "AUD-X", title: '=HYPERLINK("https://invalid.example")', status: "OPEN",
      area: "Área, Norte", objective: "Línea 1\nLínea 2" },
    risks: [], controls: [], findings: [], evidenceCount: 0
  }] });
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('"Área, Norte"'));
  assert.ok(csv.includes('"Línea 1\nLínea 2"'));
  assert.ok(!csv.includes('"=HYPERLINK'));
});

test("RF-29: Excel keeps text as text and neutralizes spreadsheet formulas", async () => {
  const { reportToXlsx } = require("../services/portfolioXlsxService");
  const bytes = await reportToXlsx({ asOf: "2026-11-12T00:00:00.000Z", scope: "Prueba",
    filters: {}, indicators: { audits: 1, risks: 0, controls: 0, findings: 0, evidence: 0,
      plannedHours: 0, executedHours: 0 }, rows: [{
      audit: { id: "AUD-X", title: '=HYPERLINK("https://invalid.example")', status: "OPEN" },
      risks: [], controls: [], findings: []
    }] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  assert.ok(workbook.getWorksheet("Auditorías").getCell("B2").value.startsWith("'="));
});

test("HU-27: the paginated PDF keeps Spanish accents and every linked record", async () => {
  const report = { asOf: "2026-11-10T00:00:00.000Z", scope: "Portafolio visible", filters: { year: "2026", quarter: "Q4" },
    indicators: { audits: 1, risks: 1, controls: 1, findings: 1, evidence: 1,
      plannedHours: 4, executedHours: 2, auditsWithPlannedHours: 1, auditsWithExecutedHours: 1 },
    rows: [{ audit: { id: "AUD-ÚNICA", title: "Revisión de operación", status: "ACTIVE",
      area: "México", responsible: "José Sánchez", year: 2026, quarter: "Q4",
      plannedHours: 4, executedHours: 2, objective: "Control de información" },
    risks: [{ id: "R-1", title: "Riesgo inherente", level: "Alto" }],
    controls: [{ id: "C-1", title: "Control periódico" }],
    findings: [{ id: "H-1", title: "Hallazgo crítico", status: "OPEN" }],
    evidence: [{ id: "E-1", title: "Evidencia válida", entityType: "AUDIT" }] }] };
  const bytes = await reportToPdf(report);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const text = await pdfText(bytes);
  for (const value of ["AUD-ÚNICA", "Revisión", "México", "José Sánchez", "R-1", "C-1", "H-1", "E-1", "Año: 2026", "Trimestre: Q4"]) {
    assert.ok(text.includes(value), `Falta en PDF: ${value}`);
  }
});
