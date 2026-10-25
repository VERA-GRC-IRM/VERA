const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createOrgUnitForUser } = require("../services/orgUnitService");
const { createGrantForUser, revokeGrantForUser } = require("../services/orgGrantService");
const { createProposalForUser } = require("../services/proposalService");
const { createRiskForUser } = require("../services/riskCreationService");
const { createControlForUser } = require("../services/controlCreationService");

const admin = { id: 1, role: "SUPER_ADMIN", username: "admin" };
const manager = { id: 3, role: "GERENTE", username: "gerente" };
const proposalInput = (stamp, orgUnitId) => ({
  title: `Propuesta sintética ${stamp}`, objective: "Examinar controles sintéticos",
  scope: "Procesos de la entidad de prueba", justification: "Ejercicio de dos entidades aisladas",
  area: "Operaciones", quarter: "Q4", year: 2026, orgUnitId
});
const riskInput = (stamp, linkedAuditId, orgUnitId) => ({
  title: `Riesgo sintético ${stamp}`, description: "Descripción de riesgo de prueba.",
  area: "Operaciones", ownerId: 5, linkedAuditId, likelihood: 2, impact: 3,
  note: "Valoración sintética", ...(orgUnitId ? { orgUnitId } : {})
});
const controlInput = (stamp, riskIds, orgUnitId) => ({
  title: `Control sintético ${stamp}`, description: "Descripción de control de prueba.",
  type: "PREVENTIVE", frequency: "Monthly", ownerId: 5, riskIds,
  rating: 2, note: "Evaluación sintética", ...(orgUnitId ? { orgUnitId } : {})
});

test("las propuestas eligen ámbito con MANAGE; riesgos y controles lo heredan sin vínculos mixtos", async () => {
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const group = await createOrgUnitForUser(admin, { code: `GP_${stamp}`,
    name: "Grupo neutral", kind: "GROUP" });
  const first = await createOrgUnitForUser(admin, { code: `LE_A_${stamp}`,
    name: "Entidad A neutral", kind: "LEGAL_ENTITY", parentId: group.id });
  const second = await createOrgUnitForUser(admin, { code: `LE_B_${stamp}`,
    name: "Entidad B neutral", kind: "LEGAL_ENTITY", parentId: group.id });

  const firstInput = proposalInput(`${stamp} A`, first.id);
  await assert.rejects(() => createProposalForUser(manager,
    proposalInput(`${stamp} inválido`, "ORG-inválido")), { status: 400 });
  await assert.rejects(() => createProposalForUser(manager, firstInput), { status: 404 });
  const view = await createGrantForUser(admin, first.id, { userId: manager.id,
    accessLevel: "VIEW", reason: "Consulta sintética" });
  await assert.rejects(() => createProposalForUser(manager, firstInput), { status: 403 });
  await revokeGrantForUser(admin, view.id, { reason: "Cambiar alcance de prueba" });
  const manage = await createGrantForUser(admin, first.id, { userId: manager.id,
    accessLevel: "MANAGE", reason: "Gestión sintética" });
  const proposal = await createProposalForUser(manager, firstInput);
  assert.equal(proposal.orgUnitId, first.id);
  const risk = await createRiskForUser(manager, riskInput(`${stamp} A`, proposal.id));
  assert.equal(risk.orgUnitId, first.id);
  const control = await createControlForUser(manager, controlInput(`${stamp} A`, [risk.id]));
  assert.equal(control.orgUnitId, first.id);
  await assert.rejects(() => createRiskForUser(manager,
    riskInput(`${stamp} otro`, proposal.id, second.id)), { status: 409 });
  await assert.rejects(() => createControlForUser(manager,
    controlInput(`${stamp} otro`, [risk.id], second.id)), { status: 409 });

  const otherProposal = await createProposalForUser(admin, proposalInput(`${stamp} B`, second.id));
  const otherRisk = await createRiskForUser(admin, riskInput(`${stamp} B`, otherProposal.id));
  await assert.rejects(() => createControlForUser(admin,
    controlInput(`${stamp} mixto`, [risk.id, otherRisk.id])), { status: 409 });
  await assert.rejects(() => createControlForUser(manager,
    controlInput(`${stamp} ajeno`, [otherRisk.id])), { status: 404 });

  await revokeGrantForUser(admin, manage.id, { reason: "Terminó la gestión sintética" });
  await assert.rejects(() => createRiskForUser(manager,
    riskInput(`${stamp} después`, proposal.id)), { status: 404 });
  const legacy = await createProposalForUser(manager, proposalInput(`${stamp} legado`, null));
  assert.equal(legacy.orgUnitId, null);
});
