const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "universal-search-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const { createOrgUnitForUser } = require("../services/orgUnitService");
const { createGrantForUser, revokeGrantForUser } = require("../services/orgGrantService");
const planningRepository = require("../repositories/planningRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const findingRepository = require("../repositories/findingRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const conversationRepository = require("../repositories/assistantConversationRepository");
const { currentScope } = require("../services/assistantConversationScope");

const admin = { id: 1, username: "admin", role: "SUPER_ADMIN" };
const manager = { id: 3, username: "gerente", role: "GERENTE" };
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

test("universal search returns only records visible to the authenticated user", async (context) => {
  const base = await startTestServer(context, app);
  const stamp = Date.now().toString(36).toUpperCase();
  const unitA = await createOrgUnitForUser(admin, { code: `USA_${stamp}`, name: "Unidad A sintética", kind: "GROUP" });
  const unitB = await createOrgUnitForUser(admin, { code: `USB_${stamp}`, name: "Unidad B sintética", kind: "GROUP" });
  const grant = await createGrantForUser(admin, unitA.id, { userId: manager.id, accessLevel: "VIEW",
    reason: "Prueba de búsqueda con dos ámbitos" });
  const audit = planningRepository.create({ title: `Búsqueda visible ${stamp}`, objective: "Objetivo de prueba",
    area: "Prueba", type: "Interna", year: 2026, quarter: "Q1", responsibleId: manager.id,
    responsible: "Gerente", risk: "Medio", orgUnitId: unitA.id });
  const denied = planningRepository.create({ title: `Búsqueda privada ${stamp}`, objective: "Objetivo de prueba",
    area: "Prueba", type: "Interna", year: 2026, quarter: "Q1", responsibleId: manager.id,
    responsible: "Gerente", risk: "Alto", orgUnitId: unitB.id });
  const risk = riskRepository.create({ title: `Riesgo visible ${stamp}`, description: "Descripción sintética",
    area: "Prueba", ownerId: manager.id, ownerName: "Gerente", orgUnitId: unitA.id,
    linkedAuditId: audit.id, likelihood: 2, impact: 2, score: 4, level: "Medio", note: "Prueba" });
  const control = controlRepository.create({ title: `Control visible ${stamp}`, description: "Descripción sintética",
    riskIds: [risk.id], orgUnitId: unitA.id, effectiveness: 3, note: "Prueba", createdBy: admin });
  const finding = findingRepository.create({ title: `Hallazgo visible ${stamp}`, riskId: risk.id,
    controlId: control.id, auditId: audit.id, createdBy: admin });
  const evidence = evidenceRepository.create({ title: `Evidencia visible ${stamp}`,
    description: "Documento sintético", entityType: "RISK", entityId: risk.id,
    entityTitle: risk.title, author: admin });
  const get = (id, q) => fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, {
    headers: id ? { Authorization: `Bearer ${token(id)}` } : {}
  });
  assert.equal((await get(null, stamp)).status, 401);
  assert.equal((await get(manager.id, "a")).status, 400);
  const response = await get(manager.id, stamp);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const { results } = await response.json();
  assert(results.some((item) => item.type === "AUDIT" && item.id === audit.id &&
    item.path === `/auditorias?auditId=${encodeURIComponent(audit.id)}`));
  assert(results.some((item) => item.type === "RISK" && item.id === risk.id));
  assert(results.some((item) => item.type === "CONTROL" && item.id === control.id));
  assert(results.some((item) => item.type === "FINDING" && item.id === finding.id));
  assert(results.some((item) => item.type === "EVIDENCE" && item.id === evidence.id));
  assert(!results.some((item) => item.id === denied.id));
  assert(results.every((item) => !Object.hasOwn(item, "description") && !Object.hasOwn(item, "score")));
  await revokeGrantForUser(admin, grant.id, { reason: "Revocación de prueba de búsqueda" });
  const after = (await (await get(manager.id, stamp)).json()).results;
  assert(!after.some((item) => item.id === audit.id));
  assert(!after.some((item) => item.id === risk.id));
});

test("universal search limits people by directory role and conversations by owner and current scope", async (context) => {
  const base = await startTestServer(context, app);
  const get = async (id, q) => {
    const response = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token(id)}` } });
    assert.equal(response.status, 200);
    return (await response.json()).results;
  };
  assert(!(await get(3, "superadmin@vera.local")).some((item) => item.type === "USER"));
  assert(!(await get(2, "superadmin@vera.local")).some((item) => item.type === "USER"));
  assert((await get(1, "superadmin@vera.local")).some((item) =>
    item.type === "USER" && item.path === "/usuarios?userId=1"));
  assert(!(await get(1, "solicitud@vera.local")).some((item) => item.type === "CONVERSATION"));

  const scope = await currentScope(manager);
  const created = await conversationRepository.create(manager, null, scope);
  await conversationRepository.update(manager, created.id, created.version, { title: "Conversación privada Zafiro" });
  try {
    const own = await get(manager.id, "Zafiro");
    assert(own.some((item) => item.type === "CONVERSATION" && item.id === created.id &&
      item.path === `/asistente?conversation=${created.id}`));
    assert(!(await get(admin.id, "Zafiro")).some((item) => item.type === "CONVERSATION"));
  } finally {
    await conversationRepository.remove(manager, created.id);
  }
});
