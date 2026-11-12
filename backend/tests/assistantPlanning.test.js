const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET ||= "assistant-planning-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const planningRepository = require("../repositories/planningRepository");
const { parsePlanningCommand } = require("../services/assistantPlanningService");

const post = (id, body) => ({ method: "POST", headers: {
  Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
  "Content-Type": "application/json"
}, body: JSON.stringify(body) });
const createProposal = async (base, title) => {
  const response = await fetch(`${base}/api/planning`, post(3, { title,
    objective: "Validar el proceso de auditoría.", scope: "Operaciones.",
    justification: "Se necesita revisar el cumplimiento del control.",
    area: "Operaciones", quarter: "Q4", year: 2026, responsibleId: 5 }));
  assert.equal(response.status, 201);
  return (await response.json()).proposal;
};
const conversation = async (base, id) => {
  const created = await fetch(`${base}/api/assistant/conversations`, post(id, { focus: null }));
  assert.equal(created.status, 201);
  return `${base}/api/assistant/conversations/${(await created.json()).conversation.id}/ask`;
};
const ask = (url, id, question) => fetch(url, post(id, { question }));
const advanceAuditToClosure = async (base, id, actorId = 3) => {
  for (const step of ["kickoff", "understanding", "execution", "supervision", "closure"]) {
    const response = await fetch(
      `${base}/api/planning/${id}/workflow-step`,
      {
        method: "PATCH",
        headers: post(actorId, { step }).headers,
        body: JSON.stringify({ step })
      }
    );
    assert.equal(response.status, 200, `No se pudo avanzar la auditoría a ${step}`);
  }
};

test("La gramática de decisiones exige un expediente y un motivo", () => {
  assert.deepEqual(parsePlanningCommand("Aprueba la propuesta «Auditoría de accesos» para Q4 porque está completa."),
    { operation: "approve", target: "Auditoría de accesos", quarter: "Q4", note: "está completa." });
  assert.deepEqual(parsePlanningCommand("Rechaza la propuesta AUD-01 porque falta el alcance."),
    { operation: "reject", target: "AUD-01", quarter: null, note: "falta el alcance." });
  assert.equal(parsePlanningCommand("Aprueba todo"), null);
});

test("El chat aprueba, inicia y cierra una auditoría con vista previa y bitácora", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const proposal = await createProposal(base, `Gobierno chat ${Date.now()}`);
  const url = await conversation(base, 3);
  const operations = [
    [`Aprueba la propuesta ${proposal.id} para Q4 porque cumple los criterios de planeación.`, "APPROVED"],
    [`Inicia la auditoría ${proposal.id} porque comenzó el periodo de ejecución.`, "ACTIVE"]
  ];
  for (const [question, status] of operations) {
    const before = await planningRepository.findById(proposal.id);
    const preview = await ask(url, 3, question);
    assert.equal((await preview.json()).message.mode, "action-preview");
    assert.equal((await planningRepository.findById(proposal.id)).status, before.status);
    const confirmed = await ask(url, 3, "Confirmar cambio");
    assert.equal(confirmed.status, 200, JSON.stringify(await confirmed.clone().json()));
    assert.equal((await confirmed.json()).message.mode, "action-executed");
    assert.equal((await planningRepository.findById(proposal.id)).status, status);
  }
  await advanceAuditToClosure(base, proposal.id);
  const closePreview = await ask(url, 3, `Cierra la auditoría ${proposal.id} porque concluyó la revisión documentada.`);
  assert.equal((await closePreview.json()).message.mode, "action-preview");
  const closeConfirmed = await ask(url, 3, "Confirmar cambio");
  assert.equal(closeConfirmed.status, 200, JSON.stringify(await closeConfirmed.clone().json()));
  assert.equal((await closeConfirmed.json()).message.mode, "action-executed");
  assert.equal((await planningRepository.findById(proposal.id)).status, "CLOSED");
  const repeated = await ask(url, 3, "Confirmar cambio");
  assert.equal((await repeated.json()).message.mode, "action-guidance");
  assert.equal((await planningRepository.findById(proposal.id)).status, "CLOSED");
});

test("Rechazo autorizado y rol de consulta no ejecuta decisiones", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const proposal = await createProposal(base, `Rechazo chat ${Date.now()}`);
  const command = `Rechaza la propuesta ${proposal.id} porque el alcance no está completo.`;
  const deniedUrl = await conversation(base, 2);
  assert.equal((await (await ask(deniedUrl, 2, command)).json()).message.mode, "action-guidance");
  assert.equal((await planningRepository.findById(proposal.id)).status, "OPEN");
  const url = await conversation(base, 1);
  assert.equal((await (await ask(url, 1, command)).json()).message.mode, "action-preview");
  const confirmed = await ask(url, 1, "Confirmar cambio");
  assert.equal(confirmed.status, 200, JSON.stringify(await confirmed.clone().json()));
  assert.equal((await confirmed.json()).message.mode, "action-executed");
  assert.equal((await planningRepository.findById(proposal.id)).status, "REJECTED");
  const ephemeral = await fetch(`${base}/api/assistant/ask`, post(1, { question: command }));
  assert.equal((await ephemeral.json()).mode, "action-guidance");
});
