const test = require("node:test");
const assert = require("node:assert/strict");

const repository = require("../repositories/supabasePlanningRepository");

test("Supabase planning adapter reads persisted rows, updates versions and detects conflicts", async (context) => {
  const previous = {
    fetch: global.fetch,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    legacy: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [name, value] of [
      ["SUPABASE_URL", previous.url],
      ["SUPABASE_SECRET_KEY", previous.secret],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.legacy]
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stored = new Map();
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/rest/v1/vera_audit_proposals");
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    const id = url.searchParams.get("id")?.slice(3);
    const version = Number(url.searchParams.get("version")?.slice(3));
    const rows = id ? [stored.get(id)].filter(Boolean) : [...stored.values()];
    if (options.method === "GET") return Response.json(rows);
    if (options.method === "POST") {
      const { id: newId, payload } = JSON.parse(options.body);
      const row = { payload, version: 1 };
      stored.set(newId, row);
      return Response.json([row], { status: 201 });
    }
    if (!rows.length || rows[0].version !== version) return Response.json([]);
    if (options.method === "PATCH") {
      const row = JSON.parse(options.body);
      stored.set(id, row);
      return Response.json([row]);
    }
    if (options.method === "DELETE") {
      stored.delete(id);
      return Response.json(rows);
    }
    throw new Error(`Unexpected method: ${options.method}`);
  };

  const created = await repository.create({ title: "Revisión A", objective: "Verificar controles", area: "Operaciones", year: 2026 });
  assert.match(created.id, /^AUD-[0-9a-f-]{36}$/);
  assert.equal(created.storageVersion, 1);
  assert.equal((await repository.getAll()).length, 1);
  assert.equal((await repository.findById(created.id)).title, "Revisión A");
  assert.equal((await repository.findDuplicate({ title: " revisión a ", area: "OPERACIONES", year: 2026 })).id, created.id);

  const approved = await repository.approve(created.id, { quarter: "Q2", approvedBy: { id: 2, name: "Dirección" } }, created.storageVersion);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.storageVersion, 2);
  await assert.rejects(
    repository.start(created.id, { startedBy: { id: 2, name: "Dirección" } }, created.storageVersion),
    (error) => error.status === 409
  );
  const active = await repository.start(created.id, { startedBy: { id: 2, name: "Dirección" } }, approved.storageVersion);
  assert.equal(active.status, "ACTIVE");
  assert.equal((await repository.getAll())[0].status, "ACTIVE");

  const [second, third] = await Promise.all([
    repository.create({ title: "Revisión B", area: "Operaciones", year: 2026 }),
    repository.create({ title: "Revisión C", area: "Operaciones", year: 2026 })
  ]);
  assert.notEqual(second.id, third.id);
  assert.equal((await repository.getAll()).length, 3);
  const scoped = await repository.create({ title: created.title, area: created.area,
    year: created.year, orgUnitId: "ORG-A", objective: "Objetivo de entidad A" });
  assert.equal((await repository.findDuplicate({ title: created.title, area: created.area,
    year: created.year })).id, created.id);
  assert.equal((await repository.findDuplicate({ title: created.title, area: created.area,
    year: created.year, orgUnitId: "ORG-A" })).id, scoped.id);
  assert.equal(await repository.findDuplicate({ title: created.title, area: created.area,
    year: created.year, orgUnitId: "ORG-B" }), null);
});
