const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "planning-integration-test-secret-32-characters";

const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    ...(body ? { "Content-Type": "application/json" } : {})
  },
  ...(body ? { body: JSON.stringify(body) } : {})
});

const director = tokenFor(2);
const manager = tokenFor(3);
const AUDITOR_ID = 5;

// Crea una auditoría y la deja aprobada (y opcionalmente iniciada).
const createApprovedAudit = async (baseUrl, { start = false } = {}) => {
  const created = await fetch(`${baseUrl}/api/planning`, json(manager, "POST", {
    title: `HU-12 edición ${Date.now()} ${Math.random()}`,
    objective: "Revisar controles de compras.",
    scope: "Compras y autorizaciones.",
    justification: "Se necesita validar el diseño de controles.",
    area: "Compras",
    year: 2026,
    likelihood: 1,
    impact: 1,
    startDate: "2026-10-01",
    endDate: "2026-10-31"
  }));
  assert.equal(created.status, 201);
  const { proposal } = await created.json();

  const approved = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(manager, "POST", { quarter: "Q4" }));
  assert.equal(approved.status, 200);

  if (start) {
    const started = await fetch(`${baseUrl}/api/planning/${proposal.id}/start`, json(manager, "POST", {}));
    assert.equal(started.status, 200);
  }
  return proposal.id;
};

const edit = (baseUrl, id, body, token = manager) =>
  fetch(`${baseUrl}/api/planning/${id}/details`, json(token, "PATCH", body));
const advanceAuditToClosure = async (baseUrl, id) => {
  for (const step of ["kickoff", "understanding", "execution", "supervision", "closure"]) {
    const stepResponse = await fetch(
      `${baseUrl}/api/planning/${id}/workflow-step`,
      json(manager, "PATCH", { step })
    );
    assert.equal(stepResponse.status, 200, `No se pudo avanzar la auditoría a ${step}`);
  }
};

test("HU-12: se edita una auditoría aprobada, se recalcula el riesgo y queda en el historial", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const id = await createApprovedAudit(baseUrl);

  const response = await edit(baseUrl, id, {
    objective: "Revisar controles de compras y pagos.",
    responsibleId: AUDITOR_ID,
    quarter: "Q1",
    likelihood: 3,
    impact: 3
  });
  assert.equal(response.status, 200);
  const { audit, changes } = await response.json();
  assert.equal(audit.status, "APPROVED");
  assert.equal(audit.objective, "Revisar controles de compras y pagos.");
  assert.equal(audit.responsibleId, AUDITOR_ID);
  assert.notEqual(audit.responsible, "Sin asignar");
  assert.equal(audit.quarter, "Q1");
  assert.equal(audit.riskScore, 9);
  assert.equal(audit.risk, "Alto");
  assert.deepEqual(changes.quarter, { from: "Q4", to: "Q1" });

  const history = await (await fetch(`${baseUrl}/api/planning/${id}/history`, json(manager))).json();
  const event = history.history.find((entry) => entry.action === "AUDIT_UPDATED");
  assert.ok(event, "debe registrarse el evento AUDIT_UPDATED");
  assert.ok(event.details.changes.objective);
});

test("HU-12: en una auditoría aprobada no se puede cambiar título, área ni quitar el trimestre", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const id = await createApprovedAudit(baseUrl);

  assert.equal((await edit(baseUrl, id, { title: "Otro título" })).status, 400);
  assert.equal((await edit(baseUrl, id, { area: "Finanzas" })).status, 400);
  assert.equal((await edit(baseUrl, id, { quarter: "" })).status, 400);
  assert.equal((await edit(baseUrl, id, { endDate: "2026-09-01" })).status, 400);
  assert.equal((await edit(baseUrl, id, { responsibleId: 999 })).status, 400);
  assert.equal((await edit(baseUrl, id, {})).status, 400);
  assert.equal((await edit(baseUrl, id, { quarter: "Q4" })).status, 400, "sin cambios reales");
});

test("HU-12: una auditoría en curso solo permite cambiar objetivo, responsable y fecha de fin", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const id = await createApprovedAudit(baseUrl, { start: true });

  const ok = await edit(baseUrl, id, { endDate: "2026-11-15", responsibleId: AUDITOR_ID });
  assert.equal(ok.status, 200);
  const { audit } = await ok.json();
  assert.equal(audit.status, "ACTIVE");
  assert.equal(audit.endDate, "2026-11-15");

  assert.equal((await edit(baseUrl, id, { quarter: "Q1" })).status, 400);
  assert.equal((await edit(baseUrl, id, { likelihood: 3 })).status, 400);
  assert.equal((await edit(baseUrl, id, { startDate: "2026-10-05" })).status, 400);
});

test("HU-12: no se editan auditorías cerradas y Director no puede editar", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const id = await createApprovedAudit(baseUrl, { start: true });

  assert.equal((await edit(baseUrl, id, { objective: "Cambio no autorizado." }, director)).status, 403);
  assert.equal((await edit(baseUrl, id, { objective: "Cambio sin token." }, "token-invalido")).status, 401);
  assert.equal((await edit(baseUrl, "AUD-NO-EXISTE", { objective: "Nada." })).status, 404);

  await advanceAuditToClosure(baseUrl, id);
  const closed = await fetch(`${baseUrl}/api/planning/${id}/close`, json(manager, "POST", {}));
  assert.equal(closed.status, 200);
  assert.equal((await edit(baseUrl, id, { objective: "Ya está cerrada." })).status, 409);
});
