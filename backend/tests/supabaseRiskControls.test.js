const test = require("node:test");
const assert = require("node:assert/strict");

const risks = require("../repositories/supabaseRiskRepository");
const controls = require("../repositories/supabaseControlRepository");

test("Supabase risks and controls retain assessments and reject stale writes", async (context) => {
  const previous = {
    fetch: global.fetch,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    legacy: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [name, value] of [
      ["SUPABASE_URL", previous.url], ["SUPABASE_SECRET_KEY", previous.secret],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.legacy]
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const tables = { vera_risks: new Map(), vera_controls: new Map() };
  global.fetch = async (input, options) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    assert.ok(tables[table]);
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    const id = url.searchParams.get("id")?.slice(3);
    const version = Number(url.searchParams.get("version")?.slice(3));
    const found = id ? [tables[table].get(id)].filter(Boolean) : [...tables[table].values()];
    if (options.method === "GET") return Response.json(found);
    if (options.method === "POST") {
      const { id: newId, payload } = JSON.parse(options.body);
      const row = { payload, version: 1 };
      tables[table].set(newId, row);
      return Response.json([row], { status: 201 });
    }
    if (options.method === "PATCH") {
      if (!found.length || found[0].version !== version) return Response.json([]);
      const row = JSON.parse(options.body);
      tables[table].set(id, row);
      return Response.json([row]);
    }
    throw new Error(`Unexpected method ${options.method}`);
  };

  const createdRisk = await risks.create({
    title: "Riesgo de prueba", area: "Finanzas", likelihood: 3, impact: 2,
    score: 6, level: "Alto", note: "Evaluación inicial válida.",
    createdBy: { id: 3, name: "Gerencia" }
  });
  assert.match(createdRisk.id, /^RSK-[0-9a-f-]{36}$/);
  assert.equal(createdRisk.evaluations.length, 1);
  assert.equal(createdRisk.evaluations[0].methodId, "legacy-3x3-v1");
  assert.equal((await risks.findDuplicate({ title: " RIESGO DE PRUEBA ", area: "finanzas" })).id, createdRisk.id);
  const evaluatedRisk = await risks.evaluate(createdRisk.id, {
    likelihood: 1, impact: 2, score: 2, level: "Bajo",
    note: "Mitigación aplicada.", assessedBy: { id: 3, name: "Gerencia" }
  }, createdRisk.storageVersion);
  assert.equal(evaluatedRisk.evaluations.length, 2);
  assert.equal(evaluatedRisk.evaluations[1].assessmentStage, "UNSPECIFIED");
  assert.equal(evaluatedRisk.storageVersion, 2);
  await assert.rejects(risks.update(createdRisk.id, { title: "Stale" }, createdRisk.storageVersion),
    (error) => error.status === 409);

  const createdControl = await controls.create({
    title: "Control de prueba", riskIds: [createdRisk.id], effectiveness: 4,
    note: "Evaluación inicial válida.", createdBy: { id: 3, username: "gerente" }
  });
  assert.match(createdControl.id, /^CTL-[0-9a-f-]{36}$/);
  assert.deepEqual(createdControl.riskIds, [createdRisk.id]);
  const evaluatedControl = await controls.evaluate(createdControl.id, {
    rating: 2, note: "Se observaron excepciones.",
    assessedBy: { id: 3, username: "gerente" }
  }, createdControl.storageVersion);
  assert.equal(evaluatedControl.effectiveness, 2);
  assert.equal(evaluatedControl.evaluations.length, 2);
  assert.equal((await controls.getAll()).length, 1);
  assert.equal((await risks.getAll()).length, 1);
});
