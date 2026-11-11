const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "assistant-integration-test-secret-32-characters";

const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { buildAssistantContext, rankAssistantRecords } = require("../services/assistantContextService");
const { getVerifiedAnswer } = require("../services/assistantVerifiedAnswers");
const { askAzureOpenAi, configuration, readiness } = require("../services/azureOpenAiService");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { createAction } = require("../services/actionService");
const { browseAssistant } = require("../services/assistantBrowseService");

const auth = (id, method = "GET", body) => ({ method, headers: {
  Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  ...(body ? { "Content-Type": "application/json" } : {})
}, ...(body ? { body: JSON.stringify(body) } : {}) });

test("Copiloto: responde conteos exactos autorizados y rechaza filtros no calculados", () => {
  const brief = [
    { key: "highRisks", label: "Riesgos altos", count: 3, path: "/riesgos" },
    { key: "activeAudits", label: "Auditorías activas", count: 2, path: "/auditorias-activas" }
  ];
  const input = { context: { focus: null }, brief, sourceCatalog: [] };
  assert.deepEqual(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay?" }), {
    answer: "Riesgos altos en tu alcance: 3.", sourceIds: [], metric: brief[0], mode: "computed"
  });
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántas auditorías activas tengo en mi alcance?" }).metric.count, 2);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay en Finanzas?" }), null);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos residuales hay?" }), null);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay este trimestre?" }), null);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay?", brief: [{ ...brief[0], count: -1 }] }), null);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos pendientes prioritarios hay?",
    context: { focus: null, pendingActionsAvailable: false } }).mode, "scope-limited");
});

test("Copiloto: incluye compromisos pendientes visibles sin ampliar el rol", async () => {
  const user = { id: 5, role: "AUDITOR", username: "auditor", name: "Auditor de prueba" };
  const risk = riskRepository.create({ title: `Riesgo con compromiso ${Date.now()}`, ownerId: 5,
    level: "Alto", score: 6, likelihood: 3, impact: 2, createdBy: { id: 3 } });
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const action = await createAction(user, { sourceType: "RISK", sourceId: risk.id,
    title: "Verificar avance del tratamiento", rationale: "Revisar evidencia y registrar avance.",
    dueDate, assigneeId: 5 });
  const own = await buildAssistantContext(user, "mis actividades pendientes");
  assert.equal(own.context.pendingActionsAvailable, true);
  assert.ok(own.visibleRecords.pending.some((item) => item.id === `ACTION_DUE_SOON:${action.id}`));
  assert.equal(own.coverage.pendingActionsUnavailable, false);
  const browsed = await browseAssistant(user, "Muéstrame mis pendientes");
  const result = browsed.browse.items.find((item) => item.id === `ACTION_DUE_SOON:${action.id}`);
  assert.ok(result);
  assert.ok(result.path.includes(encodeURIComponent(action.id)));
  assert.ok(result.facts.some((fact) => fact.label === "Detalle" && fact.value.includes(action.title)));
  const other = await buildAssistantContext({ id: 4, role: "JEFATURA" }, "mis actividades pendientes");
  assert.ok(!other.visibleRecords.pending.some((item) => item.id === `ACTION_DUE_SOON:${action.id}`));
});

test("Copiloto: cuenta todos los riesgos del área exacta y distingue un área desconocida", () => {
  const input = { context: { focus: null }, brief: [], sourceCatalog: [],
    verifiedData: { risks: [
      ...Array.from({ length: 25 }, () => ({ area: "Gestión Financiera", level: "Alto" })),
      { area: "Gestión Financiera", level: "Medio" }, { area: "Finanzas", level: "Alto" }
    ] } };
  const found = getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay en el área de Gestion Financiera?" });
  assert.equal(found.metric.count, 25);
  assert.equal(found.metric.filter.area, "Gestión Financiera");
  assert.equal(found.metric.path, "/riesgos?level=Alto&area=Gesti%C3%B3n+Financiera");
  assert.equal(found.mode, "computed");
  const missing = getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay en el área Jurídica?" });
  assert.equal(missing.metric, undefined);
  assert.match(missing.answer, /No encontré esa área/);
  assert.deepEqual(missing.references, []);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuántos riesgos altos hay en Gestión Financiera?" }), null);
});

test("Copiloto: el dato de un riesgo exige foco visible y fuente registrada", () => {
  const input = { question: "¿Cuál es el nivel y el puntaje de este riesgo?", brief: [],
    context: { focus: { type: "risk", id: "RSK-1", level: "Alto", score: 6 } },
    sourceCatalog: [{ sourceId: "risks:RSK-1" }] };
  assert.deepEqual(getVerifiedAnswer(input), {
    answer: "El nivel de este riesgo es Alto y su puntaje es 6.", sourceIds: ["risks:RSK-1"], mode: "computed"
  });
  assert.equal(getVerifiedAnswer({ ...input, sourceCatalog: [] }), null);
  assert.equal(getVerifiedAnswer({ ...input, context: { focus: null } }), null);
  assert.equal(getVerifiedAnswer({ ...input, question: "¿Cuál es el riesgo residual de este riesgo?" }), null);
});

test("Copiloto: prioriza registros que coinciden con la intención aunque estén fuera de los primeros 20", () => {
  const risks = Array.from({ length: 25 }, (_, index) => ({
    id: `RSK-${index + 1}`, title: `Riesgo ${index + 1}`, level: index === 24 ? "Alto" : "Medio"
  }));
  const selected = rankAssistantRecords("risks", risks, "¿Qué riesgos altos requieren atención?");
  assert.equal(selected.length, 20);
  assert.equal(selected[0].id, "RSK-25");
  assert.equal(rankAssistantRecords("risks", risks, "¿Qué riesgos altos hay?", new Set(["RSK-2"]))[0].id, "RSK-2");
  const audits = [{ id: "AUD-1", title: "Auditoría A", status: "CLOSED" },
    { id: "AUD-2", title: "Auditoría B", status: "ACTIVE" }];
  assert.equal(rankAssistantRecords("audits", audits, "auditorías activas")[0].id, "AUD-2");
  const controls = [{ id: "CTL-1", title: "Control A", effectiveness: 5 },
    { id: "CTL-2", title: "Control B", effectiveness: 2 }];
  assert.equal(rankAssistantRecords("controls", controls, "controles inefectivos")[0].id, "CTL-2");
});

test("HU-34: contexto de Auditoría excluye expedientes, riesgos y hallazgos ajenos", async () => {
  const ownedRisk = riskRepository.create({ title: "Riesgo asignado", ownerId: 5, level: "Alto", score: 6,
    likelihood: 3, impact: 2, note: "Riesgo asignado al auditor", createdBy: { id: 3 } });
  const otherRisk = riskRepository.create({ title: "Riesgo ajeno confidencial", ownerId: 4, level: "Medio", score: 4,
    likelihood: 2, impact: 2, note: "Riesgo de otro usuario", createdBy: { id: 3 } });
  const sharedControl = controlRepository.create({ title: "Control compartido", riskIds: [ownedRisk.id, otherRisk.id],
    effectiveness: 2, note: "Control compartido", createdBy: { id: 3 } });
  findingRepository.create({ title: "Hallazgo propio", riskId: ownedRisk.id, controlId: sharedControl.id, createdBy: { id: 5 } });
  findingRepository.create({ title: "Hallazgo ajeno confidencial", riskId: otherRisk.id, controlId: sharedControl.id, createdBy: { id: 3 } });
  const { context, references, asOf } = await buildAssistantContext({ id: 5, role: "AUDITOR" }, "riesgos y auditorías");
  assert.ok(Number.isFinite(Date.parse(asOf)));
  assert.equal(context.scope.includes("Solo auditorías"), true);
  assert.ok(context.records.audits.every((item) => item.id !== "AUD-01"));
  assert.ok(context.records.risks.some((item) => item.id === ownedRisk.id));
  assert.ok(!context.records.risks.some((item) => item.id === otherRisk.id));
  assert.ok(context.records.findings.some((item) => item.title === "Hallazgo propio"));
  assert.ok(!context.records.findings.some((item) => item.title.includes("ajeno")));
  assert.ok(context.records.controls.every((item) => item.riskIds.every((id) =>
    context.records.risks.some((risk) => risk.id === id))));
  assert.ok(references.every((item) => item.path.startsWith("/")));
  assert.equal(context.selection.risks.visible >= context.selection.risks.included, true);
  assert.equal(context.selection.risks.included, context.records.risks.length);
  const focused = await buildAssistantContext({ id: 5, role: "AUDITOR" }, "resume este riesgo", { type: "risk", id: ownedRisk.id });
  assert.equal(focused.context.focus.id, ownedRisk.id);
  assert.ok(focused.context.records.risks.some((item) => item.id === ownedRisk.id));
  assert.ok(focused.sourceCatalog.some((item) => item.sourceId === `risks:${ownedRisk.id}`));
  assert.deepEqual(focused.sourceCatalog.find((item) => item.sourceId === `risks:${ownedRisk.id}`).facts,
    [{ label: "Nivel", value: "Alto" }, { label: "Puntaje", value: "6" }]);
  assert.ok(!focused.sourceCatalog.some((item) => item.sourceId === `risks:${otherRisk.id}`));
  await assert.rejects(buildAssistantContext({ id: 5, role: "AUDITOR" }, "resume este riesgo",
    { type: "risk", id: otherRisk.id }), (error) => error.status === 404 && !error.message.includes("confidencial"));
  await assert.rejects(buildAssistantContext({ id: 5, role: "UNKNOWN" }, "riesgo"),
    (error) => error.status === 403);
});

test("HU-34: la API exige sesión, valida la pregunta y muestra estado sin secretos", async (t) => {
  const base = await startTestServer(t, app);
  assert.equal((await fetch(`${base}/api/assistant/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/assistant/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Hola" }) })).status, 401);
  const status = await fetch(`${base}/api/assistant/status`, auth(5));
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.deepEqual(await status.json(), { available: false, reason: "azure-not-configured", speech: false, mode: "read-only" });
  assert.equal((await fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question: "x" }))).status, 400);
  assert.equal((await fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question: "riesgos", history: Array(7).fill({ role: "user", text: "hola" }) }))).status, 400);
  const brief = await fetch(`${base}/api/assistant/brief`, auth(5));
  assert.equal(brief.status, 200);
  assert.equal((await brief.json()).role, "AUDITOR");
  assert.equal((await fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question: "¿Qué riesgos hay?" }))).status, 503);
});

test("Copiloto: la API calcula un indicador filtrado por rol sin llamar a Azure", async (t) => {
  const base = await startTestServer(t, app);
  const originalFetch = global.fetch;
  process.env.VERA_AI_ENABLED = "true";
  process.env.AZURE_OPENAI_ENDPOINT = "https://vera-test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key-only";
  process.env.AZURE_OPENAI_DEPLOYMENT = "vera-chat";
  let azureCalls = 0;
  global.fetch = (url, options) => {
    if (new URL(String(url)).hostname === "vera-test.openai.azure.com") {
      azureCalls += 1;
      throw new Error("Azure no debe recibir una pregunta exacta");
    }
    return originalFetch(url, options);
  };
  try {
    const briefResponse = await global.fetch(`${base}/api/assistant/brief`, auth(5));
    const { signals } = await briefResponse.json();
    const response = await global.fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question: "¿Cuántos riesgos altos tengo?" }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "computed");
    assert.equal(result.metric.count, signals.find((item) => item.key === "highRisks").count);
    assert.deepEqual(result.citations, []);
    assert.equal(result.usage, null);
    assert.equal(azureCalls, 0);
    assert.ok(!JSON.stringify(result).includes("test-key-only"));
    const area = `Gestión Estratégica ${Date.now()}`;
    riskRepository.create({ title: "Riesgo propio del área", ownerId: 5, area, level: "Alto", score: 6,
      likelihood: 3, impact: 2, createdBy: { id: 3 } });
    riskRepository.create({ title: "Otro riesgo propio del área", ownerId: 5, area, level: "Medio", score: 4,
      likelihood: 2, impact: 2, createdBy: { id: 3 } });
    riskRepository.create({ title: "Riesgo ajeno del área", ownerId: 4, area, level: "Alto", score: 6,
      likelihood: 3, impact: 2, createdBy: { id: 3 } });
    const question = `¿Cuántos riesgos altos hay en el área ${area}?`;
    const filtered = await global.fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question }));
    assert.equal(filtered.status, 200);
    const filteredBody = await filtered.json();
    assert.equal(filteredBody.metric.count, 1);
    assert.equal(filteredBody.metric.filter.area, area);
    assert.equal(filteredBody.references.length, 0);
    const linkedQuery = new URL(filteredBody.metric.path, base).search;
    const linked = await global.fetch(`${base}/api/risks/${linkedQuery}`, auth(5));
    assert.equal((await linked.json()).risks.length, 1);
    const portfolio = await global.fetch(`${base}/api/assistant/ask`, auth(2, "POST", { question }));
    assert.equal((await portfolio.json()).metric.count, 2);
    assert.equal(azureCalls, 0);
  } finally {
    global.fetch = originalFetch;
    delete process.env.VERA_AI_ENABLED;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
  }
});

test("HU-34: Azure recibe contexto filtrado y la respuesta no contiene la clave", async () => {
  const previous = {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    key: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT
  };
  process.env.AZURE_OPENAI_ENDPOINT = "https://vera-test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key-only";
  process.env.AZURE_OPENAI_DEPLOYMENT = "vera-chat";
  process.env.VERA_AI_ENABLED = "true";
  try {
    assert.equal(configuration().deployment, "vera-chat");
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(readiness(), { available: false, reason: "persistent-stores-required" });
    delete process.env.VERCEL_ENV;
    const result = await askAzureOpenAi({ question: "¿Qué hay?", context: { counts: { risks: 0 },
      sources: [{ sourceId: "risks:RSK-1" }] }, history: [{ role: "user", text: "¿Y ese riesgo?" }],
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://vera-test.openai.azure.com/openai/v1/chat/completions");
        assert.equal(options.headers["api-key"], "test-key-only");
        const request = JSON.parse(options.body);
        assert.equal(request.model, "vera-chat");
        assert.ok(request.messages[1].content.includes('"risks":0'));
        assert.ok(request.messages[1].content.includes("¿Y ese riesgo?"));
        assert.equal(request.response_format.type, "json_object");
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "No hay riesgos visibles.", sourceIds: ["risks:RSK-1", "risks:FAKE"] }) } }], usage: { prompt_tokens: 30, completion_tokens: 9 } }) };
      } });
    assert.equal(result.answer, "No hay riesgos visibles.");
    assert.deepEqual(result.sourceIds, ["risks:RSK-1"]);
    assert.ok(!JSON.stringify(result).includes("test-key-only"));
    process.env.AZURE_OPENAI_ENDPOINT = "http://localhost:3000";
    assert.throws(() => configuration(), /recurso oficial/);
  } finally {
    delete process.env.VERCEL_ENV;
    if (previous.endpoint === undefined) delete process.env.AZURE_OPENAI_ENDPOINT;
    else process.env.AZURE_OPENAI_ENDPOINT = previous.endpoint;
    if (previous.key === undefined) delete process.env.AZURE_OPENAI_API_KEY;
    else process.env.AZURE_OPENAI_API_KEY = previous.key;
    if (previous.deployment === undefined) delete process.env.AZURE_OPENAI_DEPLOYMENT;
    else process.env.AZURE_OPENAI_DEPLOYMENT = previous.deployment;
    delete process.env.VERA_AI_ENABLED;
  }
});

test("HU-34: fallas del proveedor no filtran el cuerpo remoto", async () => {
  process.env.AZURE_OPENAI_ENDPOINT = "https://vera-test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key-only";
  process.env.AZURE_OPENAI_DEPLOYMENT = "vera-chat";
  process.env.VERA_AI_ENABLED = "true";
  try {
    await assert.rejects(askAzureOpenAi({ question: "Hola", context: {},
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "SECRET FROM PROVIDER" }) }),
    (error) => error.status === 502 && !error.message.includes("SECRET"));
    await assert.rejects(askAzureOpenAi({ question: "Hola", context: {},
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "texto inválido" } }] }) }) }),
    (error) => error.status === 502);
    await assert.rejects(askAzureOpenAi({ question: "Hola", context: {},
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "{\"answer\":\"incompleta\"}" } }] }) }) }),
    (error) => error.status === 502);
  } finally {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    delete process.env.VERA_AI_ENABLED;
  }
});

test("HU-34: la ruta responde con Azure simulado y excluye datos ajenos antes de enviarlos", async (t) => {
  const base = await startTestServer(t, app);
  const citedRisk = riskRepository.create({ title: "Riesgo trazable de prueba", ownerId: 5, level: "Alto", score: 8,
    likelihood: 4, impact: 2, createdBy: { id: 3 } });
  const originalFetch = global.fetch;
  process.env.VERA_AI_ENABLED = "true";
  process.env.AZURE_OPENAI_ENDPOINT = "https://vera-test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key-only";
  process.env.AZURE_OPENAI_DEPLOYMENT = "vera-chat";
  global.fetch = (url, options) => {
    const target = new URL(String(url));
    if (target.hostname !== "vera-test.openai.azure.com" ||
        target.pathname !== "/openai/v1/chat/completions") return originalFetch(url, options);
    const prompt = JSON.parse(options.body).messages[1].content;
    assert.ok(prompt.includes("Riesgo asignado"));
    assert.ok(!prompt.includes("Riesgo ajeno confidencial"));
    assert.ok(!prompt.includes("Hallazgo ajeno confidencial"));
    return Promise.resolve(Response.json({ choices: [{ message: { content: JSON.stringify({ answer: "Tienes un riesgo visible.", sourceIds: [`risks:${citedRisk.id}`] }) } }],
      usage: { prompt_tokens: 42, completion_tokens: 6 } }));
  };
  try {
    const response = await global.fetch(`${base}/api/assistant/ask`, auth(5, "POST", { question: "¿Qué riesgos tengo?" }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.answer, "Tienes un riesgo visible.");
    assert.equal(body.mode, "generated");
    assert.ok(Number.isFinite(Date.parse(body.asOf)));
    assert.deepEqual(body.citations[0].facts, [{ label: "Nivel", value: "Alto" }, { label: "Puntaje", value: "8" }]);
    assert.ok(body.references.every((item) => item.type === "Riesgo"));
    assert.ok(!JSON.stringify(body).includes("test-key-only"));
  } finally {
    global.fetch = originalFetch;
    delete process.env.VERA_AI_ENABLED;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
  }
});
