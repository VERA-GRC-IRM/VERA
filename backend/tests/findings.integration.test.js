const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");

process.env.JWT_SECRET ||= "findings-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (id, method = "GET", body, extraHeaders = {}) => ({
  method,
  headers: { Authorization: `Bearer ${tokenFor(id)}`, ...(body ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
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
  const evidenceResponse = await fetch(`${base}/api/evidence`, json(3, "POST", {
    title: "Evidencia de la muestra", description: "Referencia documental de las excepciones revisadas.",
    evidenceType: "REPORT", reference: "muestra-sintetica-001",
    entityType: "CONTROL", entityId: control.id
  }));
  assert.equal(evidenceResponse.status, 201);
  const evidence = (await evidenceResponse.json()).evidence;
  const body = { controlId: control.id, riskId: risk.id, title: "Excepciones de conciliación",
    description: "Tres diferencias carecen de revisión y aprobación.",
    rootCause: "El procedimiento no define quién debe conciliar las diferencias detectadas.",
    severity: "HIGH", responsibleId: 5, evidenceIds: [evidence.id] };

  assert.equal((await fetch(`${base}/api/findings`, json(4, "POST", body))).status, 403);
  assert.equal((await fetch(`${base}/api/findings`, json(3, "POST", {
    ...body, rootCause: undefined
  }))).status, 400);
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST", { ...body, riskId: "RSK-999" }))).status, 404);
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST", { ...body, expectedControlVersion: 2 }))).status, 409);
  const operationId = randomUUID();
  const requestBody = { ...body, expectedControlVersion: 1 };
  const keyHeader = { "Idempotency-Key": operationId };
  const createdResponse = await fetch(`${base}/api/findings`, json(5, "POST", requestBody, keyHeader));
  assert.equal(createdResponse.status, 201);
  const finding = (await createdResponse.json()).finding;
  assert.equal(finding.controlId, control.id);
  assert.equal(finding.riskId, risk.id);
  assert.equal(finding.rootCause, body.rootCause);
  assert.equal(finding.severity, "HIGH");
  assert.equal(finding.responsibleId, 5);
  assert.equal(finding.auditId, null);
  assert.equal(finding.evaluationVersion, 1);
  assert.deepEqual(finding.evidenceIds, [evidence.id]);
  assert.equal(finding.createdBy.id, 5);
  assert.equal(finding.status, "OPEN");
  const replay = await fetch(`${base}/api/findings`, json(5, "POST", requestBody, keyHeader));
  assert.equal(replay.status, 201);
  assert.equal((await replay.json()).finding.id, finding.id);
  assert.equal((await fetch(`${base}/api/findings`, json(5, "POST",
    { ...requestBody, title: "Otro hallazgo" }, keyHeader))).status, 409);
  assert.equal((await fetch(`${base}/api/findings`, json(3, "POST", requestBody, keyHeader))).status, 404);
  const secondFindingResponse = await fetch(`${base}/api/findings`, json(5, "POST", body));
  assert.equal(secondFindingResponse.status, 201);
  assert.notEqual((await secondFindingResponse.json()).finding.id, finding.id);
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
    description: "Este control tiene una evaluación efectiva.",
    rootCause: "El control no presenta una causa raíz que justifique el hallazgo.",
    severity: "LOW"
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
    description: "La excepción requiere seguimiento y evidencia de resolución.",
    rootCause: "La validación periódica no identificó el cambio a tiempo.", severity: "HIGH"
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
  const requestedResponse = await fetch(path, json(3, "PATCH", body));
  assert.equal(requestedResponse.status, 200);
  const requested = (await requestedResponse.json()).finding;
  assert.equal(requested.status, "PENDING_CLOSURE");
  assert.equal(requested.closureHistory.at(-1).requestedBy.id, 3);
  assert.equal((await fetch(`${base}/api/actions`, json(3, "POST", {
    sourceType: "FINDING", sourceId: finding.id, title: "Acción mientras se revisa",
    rationale: "No debe permitirse cambiar el plan durante la revisión.",
    dueDate: "2026-12-31", assigneeId: 5
  }))).status, 409);
  assert.equal((await fetch(`${base}/api/actions/${action.id}/status`, json(5, "PATCH", {
    status: "DONE", note: "No debe cambiarse durante la revisión.", version: doneAction.storageVersion
  }))).status, 409);
  const decisionPath = `${base}/api/findings/${finding.id}/closure-decision`;
  assert.equal((await fetch(decisionPath, json(3, "POST", {
    version: requested.storageVersion, decision: "APPROVE"
  }))).status, 403);
  assert.equal((await fetch(decisionPath, json(5, "POST", {
    version: requested.storageVersion, decision: "APPROVE"
  }))).status, 403);
  assert.equal((await fetch(decisionPath, json(1, "POST", {
    version: requested.storageVersion, decision: "APPROVE"
  }))).status, 200);
  const closed = (await (await fetch(`${base}/api/findings?controlId=${control.id}`, json(5))).json())
    .findings.find((item) => item.id === finding.id);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closedBy.id, 1);
  assert.ok(closed.closedAt);
  assert.equal(closed.closureNote, body.note);
  assert.equal(closed.storageVersion, finding.storageVersion + 2);
  assert.equal(closed.closureHistory.at(-1).status, "APPROVED");
  assert.ok(closed.closureHistory.at(-1).decidedAt);
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
  assert.ok(JSON.stringify(await logResponse.json()).includes("FINDING_CLOSURE_APPROVED"));
});

test("RF-23: rechazar cierre exige motivo y devuelve el hallazgo a abierto", async (context) => {
  const base = await startTestServer(context, app);
  const findingResponse = await fetch(`${base}/api/findings`, json(3, "POST", {
    auditId: "AUD-01", title: "Desviación de auditoría",
    description: "El expediente de auditoría carece de una aprobación documentada.",
    rootCause: "El flujo de aprobación no asigna un responsable sustituto.",
    severity: "MEDIUM", responsibleId: 3
  }));
  assert.equal(findingResponse.status, 201);
  const finding = (await findingResponse.json()).finding;
  const deleteAuditResponse = await fetch(`${base}/api/planning/AUD-01`, json(3, "DELETE"));
  assert.equal(deleteAuditResponse.status, 409);
  const path = `${base}/api/findings/${finding.id}`;
  const actionResponse = await fetch(`${base}/api/actions`, json(3, "POST", {
    sourceType: "FINDING", sourceId: finding.id, title: "Validar corrección",
    rationale: "Comprobar que la causa raíz fue corregida y documentada.",
    dueDate: "2026-12-31", assigneeId: 3
  }));
  assert.equal(actionResponse.status, 201);
  const action = (await actionResponse.json()).action;
  assert.equal((await fetch(`${base}/api/actions/${action.id}/status`, json(3, "PATCH", {
    status: "DONE", note: "Se verificó y documentó la corrección.", version: action.storageVersion
  }))).status, 200);
  const request = await fetch(`${path}/close`, json(3, "PATCH", {
    version: finding.storageVersion, note: "Se completó la revisión y se solicita validar el cierre."
  }));
  assert.equal(request.status, 200);
  const pending = (await request.json()).finding;
  const decisionPath = `${path}/closure-decision`;
  assert.equal((await fetch(decisionPath, json(1, "POST", {
    decision: "REJECT", version: pending.storageVersion
  }))).status, 400);
  const rejectedResponse = await fetch(decisionPath, json(1, "POST", {
    decision: "REJECT", version: pending.storageVersion, reason: "La evidencia no demuestra que la causa raíz haya sido corregida."
  }));
  assert.equal(rejectedResponse.status, 200);
  const rejected = (await rejectedResponse.json()).finding;
  assert.equal(rejected.status, "OPEN");
  assert.equal(rejected.closureHistory.at(-1).status, "REJECTED");
  assert.equal(rejected.closureHistory.at(-1).decidedBy.id, 1);
  assert.ok(rejected.closureHistory.at(-1).decidedAt);
  assert.match(rejected.closureHistory.at(-1).decisionReason, /evidencia no demuestra/);
});
