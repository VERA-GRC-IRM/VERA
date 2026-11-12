const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const riskRepository = require("../repositories/riskRepository");
const presenceRepository = require("../repositories/presenceRepository");
const { startTestServer } = require("./helpers/testServer");
process.env.JWT_SECRET ||= "edit-presence-test-secret-over-32-characters";
const app = require("../server");

test("presence shows only authorized editors of the same record and can be removed", async (context) => {
  const previous = process.env.VERA_PRESENCE_ENABLED;
  process.env.VERA_PRESENCE_ENABLED = "true";
  context.after(() => {
    if (previous === undefined) delete process.env.VERA_PRESENCE_ENABLED;
    else process.env.VERA_PRESENCE_ENABLED = previous;
  });
  const base = await startTestServer(context, app);
  const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
  const call = (id, path, method = "GET", body) => fetch(`${base}/api/live/presence${path}`, {
    method, headers: { Authorization: `Bearer ${token(id)}`,
      ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const risk = riskRepository.create({ title: `Presencia ${Date.now()}`, area: "Operaciones",
    ownerId: 5, likelihood: 2, impact: 2, score: 4, level: "Medio",
    note: "Edición compartida", createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const clientId = randomUUID();
  assert.equal((await call(3, "", "POST", { type: "RISK", recordId: risk.id, clientId })).status, 204);
  const query = `?type=RISK&recordId=${risk.id}`;
  assert.equal((await fetch(`${base}/api/live/presence/cleanup`)).status, 401);
  const admin = await (await call(1, query)).json();
  assert.deepEqual(admin.editors, [{ name: "Gerente Demo" }]);
  assert.equal(JSON.stringify(admin).includes("gerente@"), false);
  assert.deepEqual((await (await call(3, query)).json()).editors, []);
  assert.equal((await call(5, "", "POST", { type: "RISK", recordId: risk.id,
    clientId: randomUUID() })).status, 403);
  assert.equal((await call(2, `/${clientId}`, "DELETE")).status, 204);
  assert.deepEqual((await (await call(1, query)).json()).editors, [{ name: "Gerente Demo" }]);
  assert.equal((await call(3, `/${clientId}`, "DELETE")).status, 204);
  assert.deepEqual((await (await call(1, query)).json()).editors, []);
  assert.equal((await call(1, "", "POST", { type: "RISK", recordId: "bad,id",
    clientId: randomUUID() })).status, 400);
  assert.equal((await call(1, "", "POST", { type: "RISK", recordId: "RSK-missing",
    clientId: randomUUID() })).status, 404);
});

test("expired presence is not returned", async () => {
  const id = randomUUID();
  await presenceRepository.upsert(3, id, "RISK", "RSK-expiry");
  const before = await presenceRepository.list("RISK", "RSK-expiry");
  assert.equal(before.length, 1);
  assert.equal(before[0].expires_at > new Date().toISOString(), true);
  await presenceRepository.remove(3, id);
  assert.equal(await presenceRepository.cleanupExpired(), 0);
});
