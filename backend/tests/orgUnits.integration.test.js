const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "org-units-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const request = (base, { method = "GET", id = 1, body, auth = true } = {}) => fetch(`${base}/api/org-units`, {
  method,
  headers: { ...(auth ? { Authorization: `Bearer ${token(id)}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("organization directory creates a typed hierarchy without changing legacy GRC records", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Date.now().toString(36).toUpperCase();
  assert.equal((await request(base, { auth: false })).status, 401);
  assert.equal((await request(base, { id: 2 })).status, 403);
  assert.equal((await request(base, { method: "POST", id: 3,
    body: { code: `GP_${stamp}`, name: "Grupo de prueba", kind: "GROUP" } })).status, 403);

  const create = (body) => request(base, { method: "POST", body });
  const groupResponse = await create({ code: `GP_${stamp}`, name: "Grupo de prueba", kind: "GROUP",
    effectiveFrom: "2026-01-01" });
  assert.equal(groupResponse.status, 201);
  const group = (await groupResponse.json()).unit;
  assert.match(group.id, /^ORG-[0-9a-f-]{36}$/);
  assert.equal(group.parentId, null);
  assert.equal(group.status, "ACTIVE");
  assert.equal(group.createdBy.id, 1);

  const legalResponse = await create({ code: `LE_${stamp}`, name: "Empresa de prueba", kind: "LEGAL_ENTITY",
    parentId: group.id, effectiveFrom: "2026-02-01" });
  assert.equal(legalResponse.status, 201);
  const legal = (await legalResponse.json()).unit;
  const businessResponse = await create({ code: `BU_${stamp}`, name: "Unidad de prueba", kind: "BUSINESS_UNIT",
    parentId: legal.id, effectiveFrom: "2026-03-01" });
  assert.equal(businessResponse.status, 201);
  const business = (await businessResponse.json()).unit;
  const siteResponse = await create({ code: `ST_${stamp}`, name: "Centro de prueba", kind: "SITE",
    parentId: business.id, effectiveFrom: "2026-04-01" });
  assert.equal(siteResponse.status, 201);
  assert.equal((await siteResponse.json()).unit.parentId, business.id);

  const listing = await request(base);
  assert.equal(listing.status, 200);
  const units = (await listing.json()).units;
  assert.ok(units.some((unit) => unit.id === legal.id && unit.parentId === group.id));
  assert.equal((await create({ code: `GP_${stamp}`, name: "Duplicado", kind: "GROUP" })).status, 409);
  assert.equal((await create({ code: `XX_${stamp}`, name: "Sin padre", kind: "BUSINESS_UNIT" })).status, 400);
  assert.equal((await create({ code: `YY_${stamp}`, name: "Padre inválido", kind: "SITE", parentId: group.id })).status, 400);
  assert.equal((await create({ code: `ZZ_${stamp}`, name: "Fecha inválida", kind: "LEGAL_ENTITY",
    parentId: group.id, effectiveFrom: "2026-02-30" })).status, 400);
  assert.equal((await create({ code: `AB_${stamp}`, name: "Antes del padre", kind: "LEGAL_ENTITY",
    parentId: group.id, effectiveFrom: "2025-12-01" })).status, 400);
});
