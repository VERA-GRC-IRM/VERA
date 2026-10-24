const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../repositories/supabaseRiskLibraryRepository");

test("Supabase risk library adapter keeps category and template revision columns", async (context) => {
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
    assert.equal(url.pathname, "/rest/v1/vera_risk_library");
    assert.equal(options.headers.apikey, "sb_secret_test");
    if (options.method === "POST") {
      const row = JSON.parse(options.body);
      assert.equal(row.kind, row.payload.kind);
      assert.equal(row.code, row.payload.code ?? null);
      assert.equal(row.parent_id, row.payload.parentId ?? null);
      assert.equal(row.template_id, row.payload.templateId ?? null);
      assert.equal(row.category_id, row.payload.categoryId ?? null);
      const stored = { payload: row.payload, version: 1 };
      rows.set(row.id, stored);
      return Response.json([stored], { status: 201 });
    }
    const id = url.searchParams.get("id")?.slice(3);
    const kind = url.searchParams.get("kind")?.slice(3);
    const code = url.searchParams.get("code")?.slice(3);
    const templateId = url.searchParams.get("template_id")?.slice(3);
    return Response.json(id ? [rows.get(id)].filter(Boolean) : [...rows.values()]
      .filter(({ payload }) => (!kind || payload.kind === kind) &&
        (!code || payload.code === code) && (!templateId || payload.templateId === templateId)));
  };
  const category = { id: "RISK-CAT-test", kind: "CATEGORY", code: "TEST",
    name: "Categoría sintética", parentId: null };
  const template = { id: "RISK-TPL-test:1", kind: "TEMPLATE", templateId: "RISK-TPL-test",
    revision: 1, categoryId: category.id, title: "Escenario sintético" };
  assert.equal((await repository.create(category)).storageVersion, 1);
  assert.equal((await repository.create(template)).storageVersion, 1);
  assert.equal((await repository.findCategoryByCode("TEST")).id, category.id);
  assert.equal((await repository.listRevisions(template.templateId)).length, 1);
  assert.equal((await repository.findById(template.id)).title, template.title);
});
