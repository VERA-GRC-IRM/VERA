const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "workspace-sync-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const EMPTY = { favorites: [], views: [], recent: [] };
const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });

test("workspace sync isolates accounts and rejects stale versions", async (context) => {
  const previous = process.env.VERA_WORKSPACE_SYNC_ENABLED;
  process.env.VERA_WORKSPACE_SYNC_ENABLED = "true";
  context.after(() => {
    if (previous === undefined) delete process.env.VERA_WORKSPACE_SYNC_ENABLED;
    else process.env.VERA_WORKSPACE_SYNC_ENABLED = previous;
  });
  const base = await startTestServer(context, app);
  const url = `${base}/api/workspace`;
  const get = (id) => fetch(url, { headers: auth(id) });
  const put = (id, expectedVersion, payload) => fetch(url, {
    method: "PUT", headers: { ...auth(id), "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion, payload })
  });
  assert.equal((await fetch(url)).status, 401);
  assert.deepEqual((await (await get(1)).json()).payload, EMPTY);
  assert.equal((await get(1)).status, 200);
  const first = { favorites: [{ path: "/dashboard", label: "Mi panel" }],
    views: [], recent: [] };
  const created = await put(1, 0, first);
  assert.equal(created.status, 200);
  assert.equal((await created.json()).version, 1);
  assert.deepEqual((await (await get(1)).json()).payload, first);
  assert.deepEqual((await (await get(3)).json()).payload, EMPTY);
  assert.equal((await put(1, 0, EMPTY)).status, 409);
  assert.equal((await put(1, 1, { ...first, favorites: [
    { path: "//external.example", label: "Ajeno" }] })).status, 400);
  const updated = await put(1, 1, EMPTY);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).version, 2);
  assert.deepEqual((await (await get(1)).json()).payload, EMPTY);
  const revoked = await put(1, 2, { ...EMPTY, favorites: [
    { path: "/auditorias?auditId=NO-EXISTE", label: "Auditoría ajena" }] });
  assert.equal(revoked.status, 200);
  assert.deepEqual((await revoked.json()).payload, EMPTY);
});
