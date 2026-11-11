const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "portfolio-report-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { reportToCsv } = require("../services/portfolioReportService");

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
    description: "Se identificó una excepción durante la revisión."
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
  const empty = await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria`, auth(3));
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).total, 0);
  const emptyCsv = await (await fetch(`${base}/api/planning/report?q=no-existe-ninguna-auditoria&format=csv`, auth(3))).text();
  assert.equal(emptyCsv.trim().split("\r\n").length, 1);
  for (const query of ["status=UNKNOWN", "q=x&q=y", "format=pdf", "responsibleId=x", "orgUnitId=invalid"]) {
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
