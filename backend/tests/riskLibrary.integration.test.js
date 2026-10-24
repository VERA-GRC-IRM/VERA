const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "risk-library-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const send = (base, path, { id = 1, method = "GET", body, auth = true } = {}) => fetch(
  `${base}/api/risk-library${path}`, { method,
    headers: { ...(auth ? { Authorization: `Bearer ${token(id)}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) }
);

test("only Super Admin publishes categories and immutable scenario revisions", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  assert.equal((await send(base, "/", { auth: false })).status, 401);
  assert.equal((await send(base, "/categories", { id: 3, method: "POST",
    body: { code: `CT_${stamp}`, name: "Categoría sintética", description: "Solo para la prueba" } })).status, 403);
  const categoryBody = { code: `CT_${stamp}`, name: "Categoría sintética", description: "Solo para la prueba" };
  const categoryResponse = await send(base, "/categories", { method: "POST", body: categoryBody });
  assert.equal(categoryResponse.status, 201);
  const category = (await categoryResponse.json()).category;
  assert.equal(category.status, "ACTIVE");
  assert.equal((await send(base, "/categories", { method: "POST", body: categoryBody })).status, 409);
  const childResponse = await send(base, "/categories", { method: "POST", body: {
    ...categoryBody, code: `CH_${stamp}`, parentId: category.id } });
  assert.equal(childResponse.status, 201);
  assert.equal((await childResponse.json()).category.parentId, category.id);
  assert.equal((await send(base, "/categories", { method: "POST",
    body: { ...categoryBody, code: `ZZ_${stamp}`, parentId: "RISK-CAT-not-found" } })).status, 400);

  const templateBody = { categoryId: category.id, title: "Escenario sintético inicial",
    scenario: "Un evento sintético afecta una operación de prueba.",
    causes: ["Causa inicial de prueba"], consequences: ["Efecto inicial de prueba"] };
  assert.equal((await send(base, "/templates", { id: 3, method: "POST", body: templateBody })).status, 403);
  assert.equal((await send(base, "/templates", { method: "POST",
    body: { ...templateBody, categoryId: "RISK-CAT-missing" } })).status, 400);
  const templateResponse = await send(base, "/templates", { method: "POST", body: templateBody });
  assert.equal(templateResponse.status, 201);
  const first = (await templateResponse.json()).template;
  assert.equal(first.revision, 1);
  assert.equal(first.status, "PUBLISHED");
  assert.equal((await send(base, `/templates/${first.templateId}/revisions`, { id: 5 })).status, 200);
  assert.equal((await send(base, `/templates/${first.templateId}/revisions`, { method: "POST",
    body: { ...templateBody, revisionReason: "corto" } })).status, 400);
  const nextBody = { ...templateBody, title: "Escenario sintético revisado",
    revisionReason: "Se aclaró el escenario de prueba" };
  const revised = await send(base, `/templates/${first.templateId}/revisions`, { method: "POST", body: nextBody });
  assert.equal(revised.status, 201);
  assert.equal((await revised.json()).template.revision, 2);
  const revisionsResponse = await send(base, `/templates/${first.templateId}/revisions`, { id: 5 });
  const revisions = (await revisionsResponse.json()).revisions;
  assert.deepEqual(revisions.map((item) => item.revision), [1, 2]);
  assert.equal(revisions[0].title, templateBody.title);
  assert.equal(revisions[1].title, nextBody.title);
  const listing = await send(base, "/", { id: 5 });
  const library = await listing.json();
  assert.equal(library.templates.find((item) => item.templateId === first.templateId).revision, 2);
  assert.equal(library.categories.find((item) => item.id === category.id).code, categoryBody.code);
  assert.equal((await send(base, "/templates/RISK-TPL-unknown/revisions")).status, 404);
});
