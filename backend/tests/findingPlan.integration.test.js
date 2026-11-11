const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "finding-plan-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const reads = require("../repositories/notificationReadRepository");

const json = (id, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-21: plan de hallazgo conserva avance, comentario, evidencia y solicitud de validación", async (context) => {
  const base = await startTestServer(context, app);
  const riskResponse = await fetch(`${base}/api/risks`, json(3, "POST", {
    title: `Riesgo para plan ${Date.now()}`, description: "La conciliación omitió una revisión independiente.",
    area: "Operaciones", ownerId: 5, linkedAuditId: "AUD-01", likelihood: 2, impact: 2,
    note: "Se detectó una excepción en una muestra documentada."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, json(3, "POST", {
    title: `Control para plan ${Date.now()}`, description: "Revisión mensual documentada de excepciones.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 5, riskIds: [risk.id], rating: 2,
    note: "El control presentó excepciones que requieren remediación."
  }));
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const findingResponse = await fetch(`${base}/api/findings`, json(3, "POST", {
    controlId: control.id, riskId: risk.id, title: "Excepción del plan",
    description: "El responsable debe corregir y documentar la excepción.",
    rootCause: "La validación de cambios no contempla las excepciones del proceso.", severity: "HIGH"
  }));
  assert.equal(findingResponse.status, 201);
  const finding = (await findingResponse.json()).finding;
  const evidenceResponse = await fetch(`${base}/api/evidence`, json(3, "POST", {
    title: "Acta de corrección", description: "Acta registrada para respaldar la remediación.",
    evidenceType: "DOCUMENT", reference: "Acta interna 2026-01", entityType: "RISK", entityId: risk.id
  }));
  assert.equal(evidenceResponse.status, 201);
  const evidence = (await evidenceResponse.json()).evidence;

  const created = await fetch(`${base}/api/actions`, json(3, "POST", {
    sourceType: "FINDING", sourceId: finding.id, title: "Corregir la conciliación",
    rationale: "Revisar la muestra y documentar el control correctivo.",
    dueDate: "2026-12-31", assigneeId: 5
  }));
  assert.equal(created.status, 201);
  let action = (await created.json()).action;
  assert.equal(action.progressPercent, 0);
  assert.equal(action.sourceControlId, control.id);
  const path = `${base}/api/actions/${action.id}`;
  assert.equal((await fetch(`${path}/validation-request`, json(5, "POST", {
    version: action.storageVersion, note: "Ya se completó el trabajo y solicito revisión."
  }))).status, 409);
  assert.equal((await fetch(`${path}/progress`, json(2, "PATCH", {
    version: action.storageVersion, progressPercent: 50, note: "Avance documentado de la revisión."
  }))).status, 403);
  assert.equal((await fetch(`${path}/progress`, json(5, "PATCH", {
    version: action.storageVersion, progressPercent: 101, note: "Valor fuera del rango permitido."
  }))).status, 400);
  assert.equal((await fetch(`${path}/progress`, json(5, "PATCH", {
    version: action.storageVersion, progressPercent: 50, note: "Se adjunta evidencia ajena.", evidenceId: "EVD-9999"
  }))).status, 404);
  const options = await fetch(`${path}/evidence-options`, json(5));
  assert.equal(options.status, 200);
  assert.ok((await options.json()).evidence.some((item) => item.id === evidence.id));

  const progressRequest = json(5, "PATCH", {
    version: action.storageVersion, progressPercent: 50,
    note: "Se corrigió la mitad de las excepciones detectadas.", evidenceId: evidence.id
  });
  progressRequest.headers["Idempotency-Key"] = "87f4a2a2-781f-4a3c-80f8-7bf8dbdc9ee1";
  const progress = await fetch(`${path}/progress`, progressRequest);
  assert.equal(progress.status, 200);
  action = (await progress.json()).action;
  assert.equal(action.progressPercent, 50);
  assert.deepEqual(action.evidenceIds, [evidence.id]);
  const progressReplay = await fetch(`${path}/progress`, progressRequest);
  assert.equal(progressReplay.status, 200);
  assert.equal((await progressReplay.json()).action.storageVersion, action.storageVersion);
  assert.equal(action.history.filter((entry) => entry.operationId === progressRequest.headers["Idempotency-Key"]).length, 1);
  const changedProgress = json(5, "PATCH", { version: action.storageVersion - 1,
    progressPercent: 80, note: "Se corrigió la mitad de las excepciones detectadas.", evidenceId: evidence.id });
  changedProgress.headers["Idempotency-Key"] = progressRequest.headers["Idempotency-Key"];
  assert.equal((await fetch(`${path}/progress`, changedProgress)).status, 409);
  assert.equal((await fetch(`${path}/progress`, json(5, "PATCH", {
    version: action.storageVersion - 1, progressPercent: 70, note: "Este cambio usa una versión antigua."
  }))).status, 409);

  const commentRequest = json(5, "POST", {
    version: action.storageVersion, note: "Se revisó la primera muestra."
  });
  commentRequest.headers["Idempotency-Key"] = "50df27c8-4524-4afb-92a2-b1c25ea114ee";
  const comment = await fetch(`${path}/comments`, commentRequest);
  assert.equal(comment.status, 200);
  action = (await comment.json()).action;
  assert.equal((await fetch(`${path}/comments`, commentRequest)).status, 200);
  const changedComment = json(5, "POST", { version: action.storageVersion - 1,
    note: "Otro comentario para la misma clave." });
  changedComment.headers["Idempotency-Key"] = commentRequest.headers["Idempotency-Key"];
  assert.equal((await fetch(`${path}/comments`, changedComment)).status, 409);
  assert.equal((await fetch(`${path}/comments`, { ...commentRequest,
    headers: { ...commentRequest.headers, Authorization: `Bearer ${jwt.sign({ id: 3 }, process.env.JWT_SECRET)}` } })).status, 409);
  assert.equal((await fetch(`${path}/comments`, { ...commentRequest,
    headers: { ...commentRequest.headers, Authorization: `Bearer ${jwt.sign({ id: 4 }, process.env.JWT_SECRET)}` } })).status, 403);
  const full = await fetch(`${path}/progress`, json(5, "PATCH", {
    version: action.storageVersion, progressPercent: 100,
    note: "Todas las excepciones de la muestra quedaron corregidas."
  }));
  assert.equal(full.status, 200);
  action = (await full.json()).action;
  const requested = await fetch(`${path}/validation-request`, json(5, "POST", {
    version: action.storageVersion, note: "Solicito validar el resultado y la evidencia vinculada."
  }));
  assert.equal(requested.status, 200);
  action = (await requested.json()).action;
  assert.ok(action.validationRequestedAt);
  assert.ok((await reads.getStoredForUser(3)).some((item) =>
    item.id.startsWith(`PLAN_VALIDATION_REQUESTED:${action.id}:`)));
  assert.deepEqual(action.history.slice(-3).map((entry) => entry.type),
    ["COMMENTED", "PROGRESS_UPDATED", "VALIDATION_REQUESTED"]);
  assert.equal((await fetch(`${path}/validation-request`, json(5, "POST", {
    version: action.storageVersion, note: "No se debe duplicar esta solicitud."
  }))).status, 409);
  assert.equal((await fetch(`${path}/validation-request`, json(3, "POST", {
    version: action.storageVersion, note: "El gerente no solicita validación por el responsable."
  }))).status, 403);
  assert.equal((await fetch(`${path}/comments`, json(4, "POST", {
    version: action.storageVersion, note: "Un usuario sin permiso de edición no puede comentar."
  }))).status, 403);
  const regressed = await fetch(`${path}/progress`, json(3, "PATCH", {
    version: action.storageVersion, progressPercent: 80,
    note: "Una observación nueva requiere ajustar el avance declarado."
  }));
  assert.equal(regressed.status, 200);
  action = (await regressed.json()).action;
  assert.equal(action.validationRequestedAt, null);
  assert.equal((await fetch(`${path}/validation-request`, json(5, "POST", {
    version: action.storageVersion, note: "Todavía no vuelve al cien por ciento."
  }))).status, 409);
  const finished = await fetch(`${path}/status`, json(5, "PATCH", {
    version: action.storageVersion, status: "DONE",
    note: "La remediación se verificó y el responsable termina el plan."
  }));
  assert.equal(finished.status, 200);
  action = (await finished.json()).action;
  assert.equal(action.progressPercent, 100);
  assert.equal((await fetch(`${path}/progress`, progressRequest)).status, 200);
  assert.equal((await fetch(`${path}/comments`, commentRequest)).status, 200);
  assert.equal((await fetch(path, json(5)).then((response) => response.json())).action.storageVersion,
    action.storageVersion);
  assert.equal((await fetch(`${path}/progress`, json(5, "PATCH", {
    version: action.storageVersion, progressPercent: 100,
    note: "Una acción terminada no admite otro avance."
  }))).status, 409);
  assert.equal((await fetch(`${path}/comments`, json(5, "POST", {
    version: action.storageVersion, note: "Un plan terminado no admite comentarios."
  }))).status, 409);
  const reopened = await fetch(`${path}/status`, json(3, "PATCH", {
    version: action.storageVersion, status: "OPEN",
    note: "La nueva revisión exige reabrir la acción para corregirla."
  }));
  assert.equal(reopened.status, 200);
  action = (await reopened.json()).action;
  assert.equal(action.progressPercent, 0);
  const reread = await fetch(path, json(5));
  assert.equal((await reread.json()).action.progressPercent, 0);
  assert.equal((await fetch(path)).status, 401);
});
