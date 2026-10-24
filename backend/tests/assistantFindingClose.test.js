const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET ||= "assistant-finding-close-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { parseFindingCloseCommand } = require("../services/assistantFindingCloseService");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const { createAction, changeStatus } = require("../services/actionService");

const user = { id: 3, role: "GERENTE", username: "gerente", name: "Gerente de prueba" };
const auditor = { id: 5, role: "AUDITOR", username: "auditor", name: "Auditor Demo" };
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
const fixture = async (ownerId = 5) => {
  const risk = riskRepository.create({ title: `Riesgo cierre ${Date.now()}-${Math.random()}`,
    description: "Riesgo que requiere seguimiento", area: "Operaciones", ownerId,
    ownerName: "Auditor Demo", linkedAuditId: "AUD-01", likelihood: 2,
    impact: 3, score: 6, level: "Alto", note: "Se necesita seguimiento de la exposición.",
    createdBy: { id: 3, name: "gerente" } });
  const control = controlRepository.create({ title: `Control cierre ${Date.now()}-${Math.random()}`,
    description: "Revisión de accesos vinculados a la operación", type: "DETECTIVE",
    frequency: "Monthly", ownerId, ownerName: "Auditor Demo", riskIds: [risk.id],
    effectiveness: 2, note: "La revisión dejó excepciones abiertas.",
    createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const finding = findingRepository.create({ title: `Hallazgo cierre ${Date.now()}-${Math.random()}`,
    description: "La revisión de accesos requiere corrección documentada", controlId: control.id,
    controlTitle: control.title, riskId: risk.id, riskTitle: risk.title,
    auditId: "AUD-01", proposalId: "AUD-01", evaluationVersion: 1,
    createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const action = await createAction(user, { sourceType: "FINDING", sourceId: finding.id,
    title: `Resolver hallazgo ${finding.id}`, rationale: "Corregir el acceso y documentar el resultado.",
    dueDate: "2026-12-31", assigneeId: ownerId });
  return { risk, control, finding, action };
};

test("Cerrar un hallazgo requiere expediente exacto y motivo", () => {
  assert.deepEqual(parseFindingCloseCommand("Cierra el hallazgo FDG-001 porque las acciones terminaron."),
    { target: "FDG-001", note: "las acciones terminaron." });
  assert.equal(parseFindingCloseCommand("Cierra todos los hallazgos"), null);
});

test("El chat exige acciones terminadas y confirma cierre con bitácora", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const { finding, action } = await fixture();
  const url = await conversation(base, 5);
  const command = `Cierra el hallazgo ${finding.id} porque las acciones de corrección terminaron y fueron revisadas.`;
  assert.match((await (await ask(url, 5, command)).json()).message.text, /Termina todas las acciones/);
  await changeStatus(auditor, action.id, { status: "DONE",
    note: "Se corrigieron los accesos y se revisó el resultado.", version: action.storageVersion });
  assert.equal((await (await ask(url, 5, command)).json()).message.mode, "action-preview");
  assert.equal((await findingRepository.findById(finding.id)).status, "OPEN");
  const confirmed = await ask(url, 5, "Confirmar cierre de hallazgo");
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).message.mode, "action-executed");
  const closed = await findingRepository.findById(finding.id);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closedBy.id, 5);
  assert.equal((await (await ask(url, 5, "Confirmar cierre de hallazgo")).json()).message.mode,
    "action-guidance");
  const ephemeral = await fetch(`${base}/api/assistant/ask`, options(5, { question: command }));
  assert.equal((await ephemeral.json()).mode, "action-guidance");
});

test("El chat deniega rol ajeno y rechaza vista previa obsoleta", async (t) => {
  const previous = process.env.VERA_AI_CONVERSATIONS_ENABLED;
  process.env.VERA_AI_CONVERSATIONS_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.VERA_AI_CONVERSATIONS_ENABLED;
    else process.env.VERA_AI_CONVERSATIONS_ENABLED = previous; });
  const base = await startTestServer(t, app);
  const { finding, action } = await fixture(3);
  await changeStatus(user, action.id, { status: "DONE",
    note: "Se corrigieron los accesos y se revisó el resultado.", version: action.storageVersion });
  const command = `Cierra el hallazgo ${finding.id} porque las acciones de corrección terminaron.`;
  const deniedUrl = await conversation(base, 5);
  assert.match((await (await ask(deniedUrl, 5, command)).json()).message.text, /No encontré ese hallazgo/);
  const url = await conversation(base, 3);
  assert.equal((await (await ask(url, 3, command)).json()).message.mode, "action-preview");
  findingRepository.mutate(finding.id, { description: "Cambió el expediente antes del cierre." },
    finding.storageVersion);
  assert.match((await (await ask(url, 3, "Confirmar cierre de hallazgo")).json()).message.text,
    /cambió desde la vista previa/);
  assert.equal((await findingRepository.findById(finding.id)).status, "OPEN");
});
