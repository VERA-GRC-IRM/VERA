const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../repositories/supabaseOrgGrantRepository");

test("Supabase grant adapter filters by unit and preserves revocation", async (context) => {
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
    assert.equal(url.pathname, "/rest/v1/vera_org_grants");
    assert.equal(options.headers.apikey, "sb_secret_test");
    const id = url.searchParams.get("id")?.slice(3);
    const version = Number(url.searchParams.get("version")?.slice(3));
    if (options.method === "POST") {
      const row = JSON.parse(options.body);
      assert.equal(row.unit_id, row.payload.unitId);
      assert.equal(row.user_id, row.payload.userId);
      const stored = { payload: row.payload, version: 1 };
      rows.set(row.id, stored);
      return Response.json([stored], { status: 201 });
    }
    if (options.method === "PATCH") {
      const row = JSON.parse(options.body);
      assert.equal(row.status, "REVOKED");
      if (rows.get(id)?.version !== version) return Response.json([]);
      const stored = { payload: row.payload, version: row.version };
      rows.set(id, stored);
      return Response.json([stored]);
    }
    const unitId = url.searchParams.get("unit_id")?.slice(3);
    const userId = url.searchParams.get("user_id")?.slice(3);
    const status = url.searchParams.get("status")?.slice(3);
    return Response.json(id ? [rows.get(id)].filter(Boolean) :
      [...rows.values()].filter(({ payload }) =>
        (!unitId || payload.unitId === unitId) &&
        (!userId || String(payload.userId) === userId) &&
        (!status || payload.status === status)));
  };
  const grant = { id: "ORG-GRANT-test", unitId: "ORG-test", userId: 1000,
    accessLevel: "VIEW", status: "ACTIVE", grantedBy: { id: 1 } };
  assert.equal((await repository.create(grant)).storageVersion, 1);
  assert.equal((await repository.findActive(grant.unitId, grant.userId)).id, grant.id);
  assert.equal((await repository.listByUnit(grant.unitId)).length, 1);
  assert.equal((await repository.listActiveByUser(grant.userId)).length, 1);
  const revoked = await repository.revoke(grant.id, { revokeReason: "Fin de prueba" }, 1);
  assert.equal(revoked.status, "REVOKED");
  assert.equal(await repository.findActive(grant.unitId, grant.userId), null);
  assert.equal((await repository.listActiveByUser(grant.userId)).length, 0);
});
