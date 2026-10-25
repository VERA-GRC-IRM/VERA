const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "business-context-owner-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const send = (base, path, { id = 1, method = "GET", body, auth = true } = {}) => fetch(`${base}${path}`, {
  method, headers: { ...(auth ? { Authorization: `Bearer ${token(id)}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("business context owner is active, scope eligible and preserved per revision", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  assert.equal((await send(base, "/api/business-context/owners", { auth: false })).status, 401);
  assert.equal((await send(base, "/api/business-context/owners", { id: 3 })).status, 403);
  const owners = (await (await send(base, "/api/business-context/owners")).json()).owners;
  assert.ok(owners.some((owner) => owner.id === 1));
  assert.ok(owners.some((owner) => owner.id === 3));
  assert.ok(!owners.some((owner) => owner.id === 6));

  const unitResponse = await send(base, "/api/org-units", { method: "POST",
    body: { code: `OW_${stamp}`, name: "Ámbito sintético de responsables", kind: "GROUP",
      effectiveFrom: "2026-01-01" } });
  assert.equal(unitResponse.status, 201);
  const unit = (await unitResponse.json()).unit;
  const record = { kind: "PROCESS", code: `PR_${stamp}`, name: "Proceso sintético",
    description: "Proceso sintético para comprobar responsables por versión.",
    effectiveFrom: "2026-01-01", unitIds: [unit.id] };
  const create = (body, id = 1) => send(base, "/api/business-context", { id, method: "POST", body });
  assert.equal((await create({ ...record, ownerId: 1 }, 3)).status, 403);
  assert.equal((await create({ ...record, ownerId: 6 })).status, 400);
  assert.equal((await create({ ...record, ownerId: 3 })).status, 400);
  const firstResponse = await create({ ...record, ownerId: 1 });
  assert.equal(firstResponse.status, 201);
  const first = (await firstResponse.json()).record;
  assert.equal(first.ownerName, "Super Admin");
  assert.equal(first.ownerId, 1);
  const unassignedResponse = await create({ ...record, code: `NP_${stamp}` });
  assert.equal(unassignedResponse.status, 201);
  assert.equal((await unassignedResponse.json()).record.ownerId, null);

  const grantResponse = await send(base, `/api/org-units/${unit.id}/grants`, { method: "POST",
    body: { userId: 3, accessLevel: "VIEW", reason: "Responsabilidad sobre el proceso sintético" } });
  assert.equal(grantResponse.status, 201);
  const grant = (await grantResponse.json()).grant;
  const revisionPath = `/api/business-context/${first.contextId}/revisions`;
  const secondResponse = await send(base, revisionPath, { method: "POST", body: {
    ...record, ownerId: 3, expectedRevision: 1, changeReason: "Se asignó responsable con acceso al ámbito" } });
  assert.equal(secondResponse.status, 201);
  const second = (await secondResponse.json()).record;
  assert.equal(second.ownerName, "Gerente Demo");
  assert.equal(second.revision, 2);
  const history = (await (await send(base, revisionPath)).json()).records;
  assert.deepEqual(history.map((item) => item.ownerId), [3, 1]);
  assert.deepEqual(history.map((item) => item.ownerName), ["Gerente Demo", "Super Admin"]);

  assert.equal((await send(base, `/api/org-units/grants/${grant.id}/revoke`, { method: "POST",
    body: { reason: "Termina la asignación del proceso sintético" } })).status, 200);
  assert.equal((await send(base, revisionPath, { method: "POST", body: {
    ...record, ownerId: 3, expectedRevision: 2, changeReason: "Esta nueva asignación debe rechazarse" } })).status, 400);
  assert.equal((await (await send(base, revisionPath)).json()).records.length, 2);
});
