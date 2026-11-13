const test = require("node:test");
const assert = require("node:assert/strict");
const riskRepository = require("../repositories/riskRepository");
const { eventType, eventVisible } = require("../services/liveEventService");
const jwt = require("jsonwebtoken");
const { startTestServer } = require("./helpers/testServer");
const auditLogger = require("../services/auditLogger");
process.env.JWT_SECRET ||= "live-events-test-secret-over-32-characters";
const app = require("../server");

test("live events signal only records visible to the current user", async () => {
  const own = riskRepository.create({ title: `Riesgo en vivo ${Date.now()}`, area: "Operaciones",
    ownerId: 5, likelihood: 2, impact: 2, score: 4, level: "Medio",
    note: "Revisión de cambios", createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const other = riskRepository.create({ title: `Otro riesgo en vivo ${Date.now()}`, area: "Operaciones",
    ownerId: 4, likelihood: 2, impact: 2, score: 4, level: "Medio",
    note: "Revisión de cambios", createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const auditor = { id: 5, role: "AUDITOR" };
  const event = (id) => ({ action: "VERA_RISKS_UPDATE", target: { id } });
  assert.equal(eventType("VERA_RISKS_UPDATE"), "RISK");
  assert.equal(await eventVisible(auditor, event(own.id)), true);
  assert.equal(await eventVisible(auditor, event(other.id)), false);
  assert.equal(await eventVisible(auditor, { action: "VERA_USERS_UPDATE", target: { id: "1" } }), false);
  assert.equal(await eventVisible(auditor, { action: "VERA_RISKS_DELETE", target: { id: own.id } }), false);
  assert.equal(await eventVisible(auditor, { action: "VERA_RISKS_UPDATE", target: { id: "RSK-not-found" } }), false);
});

test("the authenticated stream signals a committed visible change without record data", async (context) => {
  const before = process.env.VERA_LIVE_UPDATES_ENABLED;
  process.env.VERA_LIVE_UPDATES_ENABLED = "true";
  context.after(() => {
    if (before === undefined) delete process.env.VERA_LIVE_UPDATES_ENABLED;
    else process.env.VERA_LIVE_UPDATES_ENABLED = before;
  });
  const base = await startTestServer(context, app);
  const token = jwt.sign({ id: 5 }, process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/api/live/stream`)).status, 401);
  const risk = riskRepository.create({ title: `Riesgo canal ${Date.now()}`, area: "Operaciones",
    ownerId: 5, likelihood: 2, impact: 2, score: 4, level: "Medio",
    note: "Revisión de cambios", createdBy: { id: 3, username: "gerente", role: "GERENTE" } });
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 5_000);
  context.after(() => { clearTimeout(deadline); abort.abort(); });
  const response = await fetch(`${base}/api/live/stream`, {
    headers: { Authorization: `Bearer ${token}` }, signal: abort.signal
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const reader = response.body.getReader();
  await reader.read();
  auditLogger.logAccessChange({ actor: { id: 3, username: "gerente", role: "GERENTE" },
    action: "VERA_RISKS_UPDATE", target: { id: risk.id } });
  let signal = "";
  while (!signal.includes("event: change")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    signal += new TextDecoder().decode(chunk.value);
  }
  assert.match(signal, /event: change\ndata: \{\}/);
  assert.equal(signal.includes(risk.id), false);
  abort.abort();
});
