const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "evidence-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-16: evidence references can be linked to risks, controls and audits with role-scoped access", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const manager = tokenFor(3);
  const auditor = tokenFor(5);

  const createRisk = async (ownerId, suffix) => {
    const response = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", {
      title: `HU-16 ${suffix} ${Date.now()}`,
      description: "Una desviación operativa podría afectar la calidad de los resultados.",
      area: "Operaciones", ownerId, likelihood: 2, impact: 2,
      note: "La revisión actual permite medir la exposición residual."
    }));
    assert.equal(response.status, 201);
    return (await response.json()).risk;
  };
  const assignedRisk = await createRisk(5, "asignado");
  const otherRisk = await createRisk(4, "otro");
  const controlResponse = await fetch(`${baseUrl}/api/controls`, json(manager, "POST", {
    title: `HU-16 control ${Date.now()}`,
    description: "La supervisión revisa y registra una muestra periódica del proceso.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, riskIds: [assignedRisk.id], rating: 4,
    note: "La evidencia de las últimas revisiones fue completa y consistente."
  }));
  const control = (await controlResponse.json()).control;
  const findingResponse = await fetch(`${baseUrl}/api/findings`, json(manager, "POST", {
    title: "Seguimiento de excepciones", description: "Las diferencias de la muestra requieren una revisión adicional.",
    rootCause: "No se asignaba a una persona responsable de verificar las excepciones.",
    severity: "MEDIUM", assigneeId: 5, riskId: assignedRisk.id, controlId: control.id
  }));
  assert.equal(findingResponse.status, 201);
  const finding = (await findingResponse.json()).finding;

  const register = async (entityType, entityId, suffix) => fetch(`${baseUrl}/api/evidence`, json(manager, "POST", {
    title: `Evidencia ${suffix}`,
    description: `Referencia de respaldo para la relación de tipo ${entityType.toLowerCase()}.`,
    evidenceType: "REPORT",
    reference: "https://drive.google.com/file/d/vera-reference",
    entityType,
    entityId
  }));
  const riskEvidenceResponse = await register("RISK", assignedRisk.id, "de riesgo");
  assert.equal(riskEvidenceResponse.status, 201);
  const riskEvidence = (await riskEvidenceResponse.json()).evidence;
  const otherEvidenceResponse = await register("RISK", otherRisk.id, "fuera de alcance");
  assert.equal(otherEvidenceResponse.status, 201);
  const controlEvidenceResponse = await register("CONTROL", control.id, "de control");
  assert.equal(controlEvidenceResponse.status, 201);
  const auditorControlEvidenceResponse = await fetch(`${baseUrl}/api/evidence`, json(auditor, "POST", {
    title: "Evidencia del auditor",
    description: "Referencia de respaldo vinculada al control del riesgo asignado.",
    evidenceType: "REPORT",
    reference: "https://drive.google.com/file/d/auditor-control-reference",
    entityType: "CONTROL",
    entityId: control.id
  }));
  assert.equal(auditorControlEvidenceResponse.status, 201);
  const auditEvidenceResponse = await register("AUDIT", "AUD-01", "de auditoría");
  assert.equal(auditEvidenceResponse.status, 201);
  const findingEvidenceResponse = await fetch(`${baseUrl}/api/evidence`, json(auditor, "POST", {
    title: "Respaldo del hallazgo",
    description: "Referencia que documenta la excepción asignada al auditor.",
    evidenceType: "REPORT",
    reference: "https://drive.google.com/file/d/finding-reference",
    entityType: "FINDING",
    entityId: finding.id
  }));
  assert.equal(findingEvidenceResponse.status, 201);

  assert.equal(riskEvidence.entityTitle, assignedRisk.title);
  assert.equal(riskEvidence.author.id, 3);
  assert.ok(riskEvidence.createdAt);
  assert.ok(riskEvidence.id.startsWith("EVD-"));

  const auditorItems = (await (await fetch(`${baseUrl}/api/evidence`, json(auditor))).json()).evidence;
  assert.ok(auditorItems.some((item) => item.entityId === assignedRisk.id));
  assert.ok(auditorItems.some((item) => item.entityId === control.id));
  assert.ok(auditorItems.some((item) => item.title === "Evidencia del auditor" && item.entityId === control.id));
  assert.ok(auditorItems.some((item) => item.title === "Respaldo del hallazgo" &&
    item.entityType === "FINDING" && item.entityId === finding.id));
  assert.ok(!auditorItems.some((item) => item.entityId === otherRisk.id));
  assert.ok(!auditorItems.some((item) => item.entityId === "AUD-01"));

  const forbidden = await fetch(`${baseUrl}/api/evidence`, json(auditor, "POST", {
    title: "Evidencia fuera del alcance", description: "No debe adjuntarse a este riesgo no asignado.",
    evidenceType: "DOCUMENT", reference: "Drive/ref-123", entityType: "RISK", entityId: otherRisk.id
  }));
  assert.equal(forbidden.status, 404);
  const unsafeReference = await fetch(`${baseUrl}/api/evidence`, json(manager, "POST", {
    title: "Referencia no válida", description: "Esta referencia no debe convertirse en un enlace inseguro.",
    evidenceType: "DOCUMENT", reference: "javascript:alert(1)", entityType: "RISK", entityId: assignedRisk.id
  }));
  assert.equal(unsafeReference.status, 400);
  const missingEntity = await fetch(`${baseUrl}/api/evidence`, json(manager, "POST", {
    title: "Referencia sin destino", description: "No se permite almacenar evidencia huérfana.",
    evidenceType: "DOCUMENT", reference: "Drive/ref-123", entityType: "RISK", entityId: "RSK-999"
  }));
  assert.equal(missingEntity.status, 404);

  const unsupportedType = await fetch(`${baseUrl}/api/evidence`, json(manager, "POST", {
    title: "Tipo no soportado", description: "El tipo no pertenece al catálogo disponible.",
    evidenceType: "VIDEO", reference: "Drive/ref-456", entityType: "RISK", entityId: assignedRisk.id
  }));
  assert.equal(unsupportedType.status, 400);

  const search = await fetch(`${baseUrl}/api/evidence?search=${encodeURIComponent("Evidencia de control")}`, json(manager));
  assert.equal((await search.json()).evidence.length, 1);
  const noSearchResults = await fetch(`${baseUrl}/api/evidence?search=${encodeURIComponent("no existe en el expediente")}`, json(manager));
  assert.equal((await noSearchResults.json()).evidence.length, 0);

  const filtered = await fetch(`${baseUrl}/api/evidence?entityType=RISK&entityId=${assignedRisk.id}`, json(manager));
  assert.equal((await filtered.json()).evidence.length, 1);
  const anonymous = await fetch(`${baseUrl}/api/evidence`);
  assert.equal(anonymous.status, 401);
});
