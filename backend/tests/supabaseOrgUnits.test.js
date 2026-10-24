const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../repositories/supabaseOrgUnitRepository");

test("Supabase organization directory preserves code and parent relationship", async (context) => {
  const previous = { fetch: global.fetch, url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY, legacy: process.env.SUPABASE_SERVICE_ROLE_KEY };
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [key, value] of [["SUPABASE_URL", previous.url],
      ["SUPABASE_SECRET_KEY", previous.secret], ["SUPABASE_SERVICE_ROLE_KEY", previous.legacy]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rows = new Map();
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/rest/v1/vera_org_units");
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    if (options.method === "POST") {
      const row = JSON.parse(options.body);
      assert.equal(row.code, row.payload.code);
      assert.equal(row.kind, row.payload.kind);
      assert.equal(row.parent_id, row.payload.parentId);
      const stored = { payload: row.payload, version: 1 };
      rows.set(row.id, stored);
      return Response.json([stored], { status: 201 });
    }
    const id = url.searchParams.get("id")?.slice(3);
    const code = url.searchParams.get("code")?.slice(3);
    return Response.json(id ? [rows.get(id)].filter(Boolean) :
      [...rows.values()].filter((row) => !code || row.payload.code === code));
  };
  const unit = { id: "ORG-test", code: "TEST", kind: "LEGAL_ENTITY", parentId: "ORG-parent",
    name: "Empresa de prueba", createdBy: { id: 1 } };
  assert.equal((await repository.create(unit)).storageVersion, 1);
  assert.equal((await repository.findById(unit.id)).parentId, "ORG-parent");
  assert.equal((await repository.findByCode("TEST")).id, unit.id);
  assert.equal((await repository.getAll()).length, 1);
});
