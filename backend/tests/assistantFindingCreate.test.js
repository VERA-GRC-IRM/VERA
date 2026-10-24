const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET ||= "assistant-finding-create-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { parseFields } = require("../services/assistantFindingCreateService");

const options = (id, body) => ({ method: "POST", headers: {
  Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  "Content-Type": "application/json"
}, body: JSON.stringify(body) });
const conversation = async (base, id) => {
  const response = await fetch(`${base}/api/assistant/conversations`, options(id, { focus: null }));
  assert.equal(response.status, 201);
  return `${base}/api/assistant/conversations/${(await response.json()).conversation.id}/ask`;
};
const ask = (url, id, question) => fetch(url, options(id, { question }));
const fields = (title, controlId, riskId) => `Título: ${title}\nDescripción: La revisión no cubrió todos los accesos durante el periodo\nControl: ${controlId}\nRiesgo: ${riskId}`;
const fixture = (ownerId = 5, rating = 2) => {
  const risk = riskRepository.create({ title: `Riesgo hallazgo ${Date.now()}-${Math.random()}`,
    description: "Riesgo de revisión incompleta de permisos", area: "Operaciones",
    ownerId, ownerName: "Auditor Demo", responsePlan: "", linkedAuditId: "AUD-01",
    likelihood: 2, impact: 3, score: 6, level: "Alto",
    note: "Se detectó una exposición en el control.", createdBy: { id: 3, name: "gerente" } });
  const control = controlRepository.create({ title: `Control hallazgo ${Date.now()}-${Math.random()}`,
    description: "Se revisan permisos de las cuentas activas", type: "DETECTIVE",
    frequency: "Monthly", ownerId: 5, ownerName: "Auditor Demo", riskIds: [risk.id],
    effectiveness: rating, note: "La evaluación muestra una cobertura insuficiente.",
    createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  return { risk, control };
};

test("El hallazgo exige cuatro campos explícitos sin repetirlos", () => {
  assert.equal(parseFields(fields("Hallazgo A", "CTL-001", "RSK-001")).fields.title, "Hallazgo A");
  assert.match(parseFields("Título: Hallazgo A").error, /Faltan campos/);
  assert.match(parseFields(`${fields("Hallazgo A", "CTL-001", "RSK-001")}\nTítulo: Otro`).error,
    /sin repetirlos/);
});

test("Auditor dueño crea un hallazgo para control ineficaz tras confirmarlo", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const { risk, control } = fixture();
  const url = await conversation(base, 5);
  const title = `Hallazgo chat ${Date.now()}`;
  const before = (await findingRepository.getAll()).length;
  assert.match((await (await ask(url, 5, "Registrar hallazgo")).json()).message.text, /Control:/);
  const preview = await ask(url, 5, fields(title, control.id, risk.id));
  assert.equal((await preview.json()).message.mode, "action-preview");
  assert.equal((await findingRepository.getAll()).length, before);
  const confirmed = await ask(url, 5, "Confirmar hallazgo");
  assert.equal(confirmed.status, 200);
  const result = await confirmed.json();
  assert.equal(result.message.mode, "action-executed");
  assert.equal(result.historySaved, true);
  const finding = await findingRepository.findById(result.message.actionOutcome.id);
  assert.equal(finding.title, title);
  assert.equal(finding.riskId, risk.id);
  assert.equal(finding.controlId, control.id);
  assert.equal(finding.auditId, "AUD-01");
  assert.equal(finding.createdBy.id, 5);
  assert.equal((await (await ask(url, 5, "Confirmar hallazgo")).json()).message.mode,
    "action-guidance");
  assert.equal((await findingRepository.getAll()).length, before + 1);
});

test("Control eficaz, rol ajeno y evaluación alterada bloquean la creación", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const { risk, control } = fixture(3, 2);
  const auditorUrl = await conversation(base, 5);
  const denied = await ask(auditorUrl, 5, `Registrar hallazgo\n${fields("Ajeno", control.id, risk.id)}`);
  assert.match((await denied.json()).message.text, /No encontré un único control y riesgo/);
  const directorUrl = await conversation(base, 2);
  assert.match((await (await ask(directorUrl, 2, "Registrar hallazgo")).json()).message.text,
    /no registrarlos/);
  const effective = fixture(5, 4);
  const adminUrl = await conversation(base, 1);
  assert.match((await (await ask(adminUrl, 1, `Registrar hallazgo\n${fields("Eficaz", effective.control.id, effective.risk.id)}`)).json()).message.text,
    /efectividad insuficiente/);
  const title = `Hallazgo cambiante ${Date.now()}`;
  assert.equal((await (await ask(adminUrl, 1, `Registrar hallazgo\n${fields(title, control.id, risk.id)}`)).json()).message.mode,
    "action-preview");
  controlRepository.evaluate(control.id, { rating: 3, note: "Una nueva evaluación cambió el control.",
    assessedBy: { id: 3, role: "GERENTE", username: "gerente" } });
  const stale = await ask(adminUrl, 1, "Confirmar hallazgo");
  assert.match((await stale.json()).message.text, /cambió desde la vista previa/);
  assert.equal((await findingRepository.getAll()).filter((item) => item.title === title).length, 0);
});

test("Confirmaciones concurrentes no duplican y la consulta sin historial no escribe", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const { risk, control } = fixture();
  const url = await conversation(base, 3);
  const title = `Hallazgo concurrente ${Date.now()}`;
  assert.equal((await (await ask(url, 3, `Registrar hallazgo\n${fields(title, control.id, risk.id)}`)).json()).message.mode,
    "action-preview");
  const parallel = await Promise.all([ask(url, 3, "Confirmar hallazgo"),
    ask(url, 3, "Confirmar hallazgo")]);
  assert.ok(parallel.some((response) => response.status === 200));
  assert.equal((await findingRepository.getAll()).filter((item) => item.title === title).length, 1);
  const ephemeral = await fetch(`${base}/api/assistant/ask`, options(3,
    { question: `Registrar hallazgo\n${fields("Efímero", control.id, risk.id)}` }));
  assert.equal((await ephemeral.json()).mode, "action-guidance");
});
