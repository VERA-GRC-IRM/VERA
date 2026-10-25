const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET ||= "assistant-control-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const controlRepository = require("../repositories/controlRepository");
const { parseControlCommand } = require("../services/assistantControlEvaluationService");

const post = (id, body) => ({ method: "POST", headers: {
  Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  "Content-Type": "application/json"
}, body: JSON.stringify(body) });
const createControl = async (base, title) => {
  const riskResponse = await fetch(`${base}/api/risks`, post(3, {
    title: `Riesgo para ${title}`, description: "Exposición vinculada a un control de prueba.",
    area: "Operaciones", ownerId: 5, likelihood: 2, impact: 2,
    note: "La exposición necesita seguimiento en este periodo." }));
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const response = await fetch(`${base}/api/controls`, post(3, { title,
    description: "Validación independiente de la operación y sus evidencias.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, riskIds: [risk.id], rating: 4,
    note: "La primera revisión documentó un resultado satisfactorio." }));
  assert.equal(response.status, 201);
  return (await response.json()).control;
};
const conversation = async (base, id) => {
  const created = await fetch(`${base}/api/assistant/conversations`, post(id, { focus: null }));
  assert.equal(created.status, 201);
  return `${base}/api/assistant/conversations/${(await created.json()).conversation.id}/ask`;
};
const ask = (url, id, question) => fetch(url, post(id, { question }));
const conversationsEnabled = (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
};

test("La instrucción de control exige registro, calificación y justificación", () => {
  assert.deepEqual(parseControlCommand("Evalúa el control «Conciliación» con efectividad 2 porque aparecen excepciones recientes."),
    { target: "Conciliación", rating: 2, note: "aparecen excepciones recientes." });
  assert.equal(parseControlCommand("Evalúa todos los controles"), null);
});

test("El chat evalúa un control tras confirmar y no repite la operación", async (t) => {
  conversationsEnabled(t);
  const base = await startTestServer(t, app);
  const control = await createControl(base, `Control chat ${Date.now()}`);
  const url = await conversation(base, 3);
  const command = `Evalúa el control ${control.id} con efectividad 2 porque la evidencia muestra excepciones recientes.`;
  const preview = await ask(url, 3, command);
  assert.equal((await preview.json()).message.mode, "action-preview");
  assert.equal((await controlRepository.findById(control.id)).evaluations.length, 1);
  const confirmed = await ask(url, 3, "Confirmar control");
  assert.equal(confirmed.status, 200, JSON.stringify(await confirmed.clone().json()));
  const answer = (await confirmed.json()).message;
  assert.equal(answer.mode, "action-executed");
  assert.match(answer.text, /valoración preliminar/);
  assert.match(answer.text, /no demuestra eficacia/);
  const updated = await controlRepository.findById(control.id);
  assert.equal(updated.evaluations.length, 2);
  assert.equal(updated.effectiveness, 2);
  assert.equal(updated.evaluations[1].assessedBy.id, 3);
  assert.equal((await (await ask(url, 3, "Confirmar control")).json()).message.mode, "action-guidance");
  assert.equal((await controlRepository.findById(control.id)).evaluations.length, 2);
});

test("Otro cambio anula la vista previa y Director no puede evaluar controles", async (t) => {
  conversationsEnabled(t);
  const base = await startTestServer(t, app);
  const control = await createControl(base, `Control cambiante ${Date.now()}`);
  const command = `Evalúa el control ${control.id} con efectividad 2 porque la evidencia muestra excepciones recientes.`;
  const denied = await conversation(base, 2);
  assert.equal((await (await ask(denied, 2, command)).json()).message.mode, "action-guidance");
  const url = await conversation(base, 3);
  assert.equal((await (await ask(url, 3, command)).json()).message.mode, "action-preview");
  const direct = await fetch(`${base}/api/controls/${control.id}/evaluate`, post(3, {
    rating: 3, note: "La valoración cambió antes de confirmar el chat." }));
  assert.equal(direct.status, 200);
  assert.equal((await (await ask(url, 3, "Confirmar control")).json()).message.mode, "action-guidance");
  assert.equal((await controlRepository.findById(control.id)).evaluations.length, 2);
  const ephemeral = await fetch(`${base}/api/assistant/ask`, post(3, { question: command }));
  assert.equal((await ephemeral.json()).mode, "action-guidance");
});
