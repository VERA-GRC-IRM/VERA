const test = require("node:test");
const assert = require("node:assert/strict");

const risks = require("../repositories/riskRepository");
const proposals = require("../repositories/planningRepository");

test("risk and audit duplicate keys are isolated by explicit organizational scope", async () => {
  const stamp = Date.now().toString(36);
  const riskKey = { title: `Riesgo duplicado ${stamp}`, area: "Operaciones" };
  const auditKey = { title: `Auditoría duplicada ${stamp}`, area: "Operaciones", year: 2026 };
  const scopedRisk = await risks.create({ ...riskKey, orgUnitId: "ORG-A", likelihood: 2, impact: 2,
    score: 4, level: "Medio", note: "Evaluación sintética", createdBy: { id: 1, name: "Prueba" } });
  const scopedAudit = await proposals.create({ ...auditKey, orgUnitId: "ORG-A",
    objective: "Objetivo sintético", createdBy: { id: 1, name: "Prueba" } });

  assert.equal(await risks.findDuplicate(riskKey), null);
  assert.equal(await proposals.findDuplicate(auditKey), null);
  assert.equal((await risks.findDuplicate({ ...riskKey, orgUnitId: "ORG-A" })).id, scopedRisk.id);
  assert.equal((await proposals.findDuplicate({ ...auditKey, orgUnitId: "ORG-A" })).id, scopedAudit.id);
  assert.equal(await risks.findDuplicate({ ...riskKey, orgUnitId: "ORG-B" }), null);
  assert.equal(await proposals.findDuplicate({ ...auditKey, orgUnitId: "ORG-B" }), null);
  assert.equal(await risks.findDuplicate({ ...riskKey, orgUnitId: "ORG-A" }, scopedRisk.id), null);
  assert.equal(await proposals.findDuplicate({ ...auditKey, orgUnitId: "ORG-A" }, scopedAudit.id), null);
});
