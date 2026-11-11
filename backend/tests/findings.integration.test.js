const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "findings-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (id, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${tokenFor(id)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-15: un hallazgo conserva control, riesgo, auditoría y versión de evaluación", async (context) => {
  const base = await startTestServer(context, app);
  const riskResponse = await fetch(`${base}/api/risks`, json(3, "POST", {
    title: `Riesgo de hallazgo ${Date.now()}`, description: "Falla de conciliación detectada en revisión mensual.",
    area: "Finanzas", ownerId: 5, linkedAuditId: "AUD-01", likelihood: 2, impact: 2,
    note: "La revisión de la muestra mostró excepciones documentadas."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, json(3, "POST", {
    title: `Control de hallazgo ${Date.now()}`, description: "Conciliación mensual de registros contables.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 5, riskIds: [risk.id], rating: 2,
    note: "La muestra contiene varias discrepancias sin corregir."
  }));
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const body = { controlId: control.id, riskId: risk.id, title: "Excepciones de conciliación", description: "Tres diferencias carecen de revisión y aprobación." };

  assert.equal((await fetch(`${base}/api/findings`, json(4, "POST", body))).status, 403);
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST", { ...body, riskId: "RSK-999" }))).status, 404);
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST", { ...body, expectedControlVersion: 0 }))).status, 409);
  const createdResponse = await fetch(`${base}/api/findings`, json(5, "POST", { ...body, expectedControlVersion: 1 }));
  assert.equal(createdResponse.status, 201);
  const finding = (await createdResponse.json()).finding;
  assert.equal(finding.controlId, control.id);
  assert.equal(finding.riskId, risk.id);
  assert.equal(finding.auditId, "AUD-01");
  assert.equal(finding.evaluationVersion, 1);
  assert.equal(finding.createdBy.id, 5);
  assert.equal(finding.status, "OPEN");
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST", body))).status, 409);
  const visible = await fetch(`${base}/api/findings?controlId=${control.id}`, json(5));
  assert.equal(visible.status, 200);
  assert.ok((await visible.json()).findings.some((item) => item.id === finding.id));
  assert.equal((await fetch(`${base}/api/findings`)).status, 401);
});

test("HU-15: no abre hallazgo con evaluación efectiva", async (context) => {
  const base = await startTestServer(context, app);
  const riskResponse = await fetch(`${base}/api/risks`, json(3, "POST", {
    title: `Riesgo sin hallazgo ${Date.now()}`, description: "Probabilidad de error en la conciliación de cuentas.",
    area: "Operaciones", ownerId: 5, likelihood: 1, impact: 2,
    note: "Se examinó una muestra independiente de registros."
  }));
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, json(3, "POST", {
    title: `Control efectivo ${Date.now()}`, description: "Revisión independiente de los registros.",
    type: "PREVENTIVE", frequency: "Monthly", ownerId: 5, riskIds: [risk.id], rating: 4,
    note: "La evidencia es suficiente para esta muestra."
  }));
  const control = (await controlResponse.json()).control;
  const response = await fetch(`${base}/api/findings`, json(3, "POST", {
    controlId: control.id, riskId: risk.id, title: "Hallazgo improcedente",
    description: "Este control tiene una evaluación efectiva."
  }));
  assert.equal(response.status, 409);
});

test("RF-23: el hallazgo cierra solo tras completar su plan y registra actor y fecha", async (context) => {
  const base = await startTestServer(context, app);
  const riskResponse = await fetch(`${base}/api/risks`, json(3, "POST", {
    title: `Riesgo de cierre ${Date.now()}`, description: "La revisión detectó excepciones sin resolver.",
    area: "Operaciones", ownerId: 5, linkedAuditId: "AUD-01", likelihood: 2, impact: 2,
    note: "Se requiere una acción documentada para resolver la observación."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, json(3, "POST", {
    title: `Control de cierre ${Date.now()}`, description: "Revisión documentada de las operaciones.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 5, riskIds: [risk.id], rating: 2,
    note: "La muestra aún tiene excepciones pendientes."
  }));
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const findingResponse = await fetch(`${base}/api/findings`, json(3, "POST", {
    controlId: control.id, riskId: risk.id, title: "Excepción por cerrar",
    description: "La excepción requiere seguimiento y evidencia de resolución."
  }));
  assert.equal(findingResponse.status, 201);
  const finding = (await findingResponse.json()).finding;
  const path = `${base}/api/findings/${finding.id}/close`;
  const body = { version: finding.storageVersion, note: "El responsable completó el plan y se revisó el resultado." };
  assert.equal((await fetch(path, json(3, "PATCH", body))).status, 409);
  assert.equal((await fetch(path, json(2, "PATCH", body))).status, 403);
  assert.equal((await fetch(path, json(4, "PATCH", body))).status, 403);
  assert.equal((await fetch(path, json(5, "PATCH", { ...body, note: "breve" }))).status, 400);

  const createdAction = await fetch(`${base}/api/actions`, json(3, "POST", {
    sourceType: "FINDING", sourceId: finding.id, title: "Resolver observación",
    rationale: "Corregir las excepciones y documentar el resultado.",
    dueDate: "2026-12-31", assigneeId: 5
  }));
  assert.equal(createdAction.status, 201);
  const action = (await createdAction.json()).action;
  assert.equal((await fetch(path, json(3, "PATCH", body))).status, 409);
  const completed = await fetch(`${base}/api/actions/${action.id}/status`, json(5, "PATCH", {
    status: "DONE", note: "Se corrigió la excepción y se revisó el resultado.", version: action.storageVersion
  }));
  assert.equal(completed.status, 200);
  const doneAction = (await completed.json()).action;
  assert.equal((await fetch(path, json(5, "PATCH", { ...body, version: body.version + 1 }))).status, 409);
  const closedResponse = await fetch(path, json(5, "PATCH", body));
  assert.equal(closedResponse.status, 200);
  const closed = (await closedResponse.json()).finding;
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closedBy.id, 5);
  assert.ok(closed.closedAt);
  assert.equal(closed.closureNote, body.note);
  assert.equal(closed.storageVersion, finding.storageVersion + 1);
  assert.equal((await fetch(path, json(5, "PATCH", body))).status, 409);
  assert.equal((await fetch(`${base}/api/actions`, json(3, "POST", {
    sourceType: "FINDING", sourceId: finding.id, title: "Acción tardía",
    rationale: "No debe agregarse a un hallazgo cerrado.", dueDate: "2026-12-31", assigneeId: 5
  }))).status, 409);
  assert.equal((await fetch(`${base}/api/actions/${action.id}/status`, json(5, "PATCH", {
    status: "OPEN", note: "No debe reabrirse tras el cierre del hallazgo.", version: doneAction.storageVersion
  }))).status, 409);
  const logResponse = await fetch(`${base}/api/audit`, json(1));
  assert.equal(logResponse.status, 200);
  assert.ok(JSON.stringify(await logResponse.json()).includes("FINDING_CLOSED"));
});
