const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "business-import-integration-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const send = (base, path, { id = 1, body, auth = true } = {}) => fetch(`${base}${path}`, {
  method: "POST", headers: { "Content-Type": "application/json",
    ...(auth ? { Authorization: `Bearer ${token(id)}` } : {}) }, body: JSON.stringify(body)
});

test("CSV connector previews, publishes once and records file provenance without overwriting", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  const unitResponse = await send(base, "/api/org-units", { body: {
    kind: "GROUP", code: `IMP_${stamp}`, name: `Grupo de importación ${stamp}`, effectiveFrom: "2026-01-01" } });
  assert.equal(unitResponse.status, 201);
  const unit = (await unitResponse.json()).unit;
  const content = "kind,code,name,description,effectiveFrom,effectiveTo,unitCodes\n" +
    `PROCESS,IMP_PROC_${stamp},Proceso ${stamp},Proceso sintético para comprobar importación,2026-01-01,,${unit.code}\n` +
    `OBJECTIVE,IMP_OBJ_${stamp},Objetivo ${stamp},Objetivo sintético para comprobar importación,2026-01-01,,${unit.code}\n`;
  const input = { format: "csv", sourceName: "Archivo sintético del equipo", content };
  const path = "/api/business-context/import/preview";
  assert.equal((await send(base, path, { body: input, auth: false })).status, 401);
  assert.equal((await send(base, path, { body: input, id: 3 })).status, 403);
  const previewResponse = await send(base, path, { body: input });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.deepEqual(preview.counts, { CREATE: 2, UNCHANGED: 0, CONFLICT: 0, INVALID: 0 });
  assert.equal(preview.rows[0].line, 2);
  assert.equal(preview.rows[0].data, undefined);
  assert.match(preview.fileDigest, /^[0-9a-f]{64}$/);
  assert.equal((await send(base, "/api/business-context/import/apply", {
    body: { ...input, expectedDigest: "otro" } })).status, 409);
  const appliedResponse = await send(base, "/api/business-context/import/apply", {
    body: { ...input, expectedDigest: preview.previewDigest } });
  assert.equal(appliedResponse.status, 200);
  const applied = await appliedResponse.json();
  assert.deepEqual(applied.summary, { created: 2, unchanged: 0, failed: 0, notApplied: 0 });
  const listing = await (await fetch(`${base}/api/business-context`, {
    headers: { Authorization: `Bearer ${token(1)}` } })).json();
  const imported = listing.records.find(({ code }) => code === `IMP_PROC_${stamp}`);
  assert.ok(imported);
  assert.equal(imported.revision, 1);
  assert.ok(imported.unitIds.includes(unit.id));
  assert.ok(imported.sourceNote.includes(preview.fileDigest));
  const repeatPreview = await (await send(base, path, { body: input })).json();
  assert.deepEqual(repeatPreview.counts, { CREATE: 0, UNCHANGED: 2, CONFLICT: 0, INVALID: 0 });
  const repeat = await send(base, "/api/business-context/import/apply", {
    body: { ...input, expectedDigest: repeatPreview.previewDigest } });
  assert.equal(repeat.status, 200);
  assert.deepEqual((await repeat.json()).summary, { created: 0, unchanged: 2, failed: 0, notApplied: 0 });
  const changed = { ...input, content: input.content.replace(`Proceso ${stamp}`, `Proceso revisado ${stamp}`) };
  const conflict = await (await send(base, path, { body: changed })).json();
  assert.equal(conflict.counts.CONFLICT, 1);
  assert.equal(conflict.counts.UNCHANGED, 1);
  const rejected = await send(base, "/api/business-context/import/apply", {
    body: { ...changed, expectedDigest: conflict.previewDigest } });
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).preview.counts.CONFLICT, 1);
});

test("JSON connector rejects unknown units, repeated codes and malformed templates before writing", async (context) => {
  const base = await startTestServer(context, app);
  const sourceName = "Origen sintético de prueba";
  const row = { kind: "SERVICE", code: `SVC_${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    name: "Servicio de prueba", description: "Servicio sintético para validar el conector JSON.",
    effectiveFrom: "2026-01-01", effectiveTo: "", unitCodes: ["NO_EXISTE"] };
  const input = { format: "json", sourceName, content: JSON.stringify([row, row]) };
  const preview = await (await send(base, "/api/business-context/import/preview", { body: input })).json();
  assert.deepEqual(preview.counts, { CREATE: 0, UNCHANGED: 0, CONFLICT: 0, INVALID: 2 });
  assert.equal((await send(base, "/api/business-context/import/apply", {
    body: { ...input, expectedDigest: preview.previewDigest } })).status, 409);
  assert.equal((await send(base, "/api/business-context/import/preview", { body: {
    format: "csv", sourceName, content: "wrong,headers\nvalue,value" } })).status, 400);
  assert.equal((await send(base, "/api/business-context/import/preview", { body: {
    format: "json", sourceName, content: JSON.stringify([{ ...row, secret: "ignored" }]) } })).status, 400);
  assert.equal((await send(base, "/api/business-context/import/preview", { body: {
    format: "json", sourceName, content: JSON.stringify([row]).replace("Servicio", "Servi\uFFFDio") } })).status, 400);
  const stamp = Math.random().toString(36).slice(2, 10).toUpperCase();
  const unitResponse = await send(base, "/api/org-units", { body: {
    kind: "GROUP", code: `JSON_${stamp}`, name: `Grupo JSON ${stamp}`, effectiveFrom: "2026-01-01" } });
  assert.equal(unitResponse.status, 201);
  const unit = (await unitResponse.json()).unit;
  const valid = { ...row, code: `JSON_SVC_${stamp}`, unitCodes: [unit.code] };
  const validInput = { format: "json", sourceName, content: `\uFEFF${JSON.stringify([valid])}` };
  const ready = await (await send(base, "/api/business-context/import/preview", { body: validInput })).json();
  assert.equal(ready.counts.CREATE, 1);
  const published = await send(base, "/api/business-context/import/apply", {
    body: { ...validInput, expectedDigest: ready.previewDigest } });
  assert.equal(published.status, 200);
  assert.equal((await published.json()).summary.created, 1);
});
