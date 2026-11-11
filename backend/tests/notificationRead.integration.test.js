const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "notification-read-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const reads = require("../repositories/notificationReadRepository");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const options = (id, method = "GET", body) => ({
  method, headers: { Authorization: `Bearer ${tokenFor(id)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-17: la lectura es individual y la tarea sigue pendiente hasta resolverla", async (context) => {
  const base = await startTestServer(context, app);
  const created = await fetch(`${base}/api/planning`, options(3, "POST", {
    title: `HU-17 lectura ${Date.now()}`, objective: "Decidir la revisión del proceso.",
    scope: "Compras regionales.", justification: "El riesgo requiere una revisión.",
    area: "Compras", year: 2026, quarter: "Q3"
  }));
  assert.equal(created.status, 201);
  const proposal = (await created.json()).proposal;
  const id = `PROPOSAL_REVIEW:${proposal.id}`;
  assert.ok((await reads.getStoredForUser(1)).some((item) => item.id === id));
  const url = `${base}/api/notifications/${encodeURIComponent(id)}/read`;
  assert.equal((await fetch(url, options(4, "PUT"))).status, 404);
  assert.equal((await fetch(url, options(2, "PUT"))).status, 403);
  assert.equal((await fetch(url, { method: "PUT" })).status, 401);
  const read = await fetch(url, options(3, "PUT"));
  assert.equal(read.status, 200);
  const { readAt } = await read.json();
  assert.ok(readAt);
  const manager = (await (await fetch(`${base}/api/notifications`, options(3))).json()).notifications;
  assert.equal(manager.find((item) => item.id === id).readAt, readAt);
  const superAdmin = (await (await fetch(`${base}/api/notifications`, options(1))).json()).notifications;
  assert.equal(superAdmin.find((item) => item.id === id).readAt, null);
  assert.equal((await fetch(url, options(3, "DELETE"))).status, 200);
  const unread = (await (await fetch(`${base}/api/notifications`, options(3))).json()).notifications;
  assert.equal(unread.find((item) => item.id === id).readAt, null);
});

test("HU-17: hallazgo y evidencia reales llegan al dueño visible y enlazan al registro", async (context) => {
  const base = await startTestServer(context, app);
  const riskResponse = await fetch(`${base}/api/risks`, options(3, "POST", {
    title: `Riesgo de avisos ${Date.now()}`, description: "Un riesgo requiere seguimiento del responsable.",
    area: "Operaciones", ownerId: 5, likelihood: 3, impact: 2,
    note: "Se observó una exposición durante la revisión del proceso."
  }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const controlResponse = await fetch(`${base}/api/controls`, options(3, "POST", {
    title: `Control de avisos ${Date.now()}`, description: "Revisión periódica del riesgo registrado.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, riskIds: [risk.id], rating: 2,
    note: "La prueba encontró excepciones que requieren seguimiento."
  }));
  assert.equal(controlResponse.status, 201);
  const control = (await controlResponse.json()).control;
  const findingResponse = await fetch(`${base}/api/findings`, options(3, "POST", {
    controlId: control.id, riskId: risk.id, title: "Excepción avisada",
    description: "La excepción quedó vinculada al riesgo y control."
  }));
  assert.equal(findingResponse.status, 201);
  const finding = (await findingResponse.json()).finding;
  const evidenceResponse = await fetch(`${base}/api/evidence`, options(3, "POST", {
    title: "Acta de revisión", description: "Acta de revisión para el riesgo registrado.",
    evidenceType: "DOCUMENT", reference: "acta-avisos-001", entityType: "RISK", entityId: risk.id
  }));
  assert.equal(evidenceResponse.status, 201);
  const evidence = (await evidenceResponse.json()).evidence;
  const actionResponse = await fetch(`${base}/api/actions`, options(3, "POST", {
    sourceType: "RISK", sourceId: risk.id, title: "Atender riesgo avisado",
    rationale: "La revisión requiere seguimiento formal de un responsable.",
    dueDate: "2026-12-31", assigneeId: 5
  }));
  assert.equal(actionResponse.status, 201);
  const action = (await actionResponse.json()).action;
  const stored = await reads.getStoredForUser(5);
  assert.ok(stored.some((item) => item.id === `FINDING_CREATED:${finding.id}`));
  assert.ok(stored.some((item) => item.id === `EVIDENCE_CREATED:${evidence.id}`));
  assert.ok(stored.some((item) => item.id.startsWith(`ACTION_ASSIGNED:${action.id}:`)));
  assert.ok(!(await reads.getStoredForUser(4)).some((item) => item.entityId === evidence.id));
  const owner = (await (await fetch(`${base}/api/notifications`, options(5))).json()).notifications;
  assert.ok(owner.some((item) => item.id === `FINDING_CREATED:${finding.id}` && item.path.includes(finding.id)));
  assert.ok(owner.some((item) => item.id === `EVIDENCE_CREATED:${evidence.id}` && item.path.includes(evidence.id)));
  const other = (await (await fetch(`${base}/api/notifications`, options(4))).json()).notifications;
  assert.ok(!other.some((item) => item.entityId === finding.id || item.entityId === evidence.id));
});
