const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "planning-history-integration-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

const advanceAuditToClosure = async (baseUrl, id, token) => {
  for (const step of ["kickoff", "understanding", "execution", "supervision", "closure"]) {
    const stepResponse = await fetch(
      `${baseUrl}/api/planning/${id}/workflow-step`,
      json(token, "PATCH", { step })
    );
    assert.equal(stepResponse.status, 200, `No se pudo avanzar la auditoría a ${step}`);
  }
};

test("HU-18: contextual history shows proposal lifecycle events and comments with author and timestamp", async (context) => {
  const baseUrl = await startTestServer(context, app);
  const manager = tokenFor(3);
  const director = tokenFor(2);
  const auditor = tokenFor(5);
  const jefatura = tokenFor(4);

  const anonymous = await fetch(`${baseUrl}/api/planning/AUD-01/history`);
  assert.equal(anonymous.status, 401);

  const createdResponse = await fetch(`${baseUrl}/api/planning`, json(manager, "POST", {
    title: `HU-18 history ${Date.now()}`,
    objective: "Comprobar la trazabilidad de decisiones y comentarios.",
    scope: "Operaciones y controles de proceso.",
    justification: "Se requiere una bitácora completa.",
    area: "Operaciones",
    responsibleId: 5,
    year: 2026,
    quarter: "Q2"
  }));
  assert.equal(createdResponse.status, 201);
  const proposal = (await createdResponse.json()).proposal;
  const updated = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(manager, "PUT", {
    title: `${proposal.title} revisada`, objective: proposal.objective, scope: proposal.scope, justification: proposal.justification, area: proposal.area,
    responsibleId: 5, year: 2026, quarter: proposal.quarter, likelihood: 2, impact: 2
  }));
  assert.equal(updated.status, 200);

  const notAssignedProposalResponse = await fetch(`${baseUrl}/api/planning`, json(manager, "POST", {
    title: `HU-18 scope ${Date.now()}`,
    objective: "Propuesta para comprobar alcance por persona asignada.",
    scope: "Finanzas.",
    justification: "Se necesita comprobar el alcance por rol.",
    area: "Finanzas",
    year: 2026,
    quarter: "Q2"
  }));
  const notAssignedProposal = (await notAssignedProposalResponse.json()).proposal;
  const hiddenHistory = await fetch(`${baseUrl}/api/planning/${notAssignedProposal.id}/history`, json(auditor));
  assert.equal(hiddenHistory.status, 404);
  const hiddenComment = await fetch(`${baseUrl}/api/planning/${notAssignedProposal.id}/comments`, json(auditor, "POST", { text: "Comentario fuera de alcance." }));
  assert.equal(hiddenComment.status, 404);

  const approval = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(manager, "POST", { quarter: "Q2" }));
  assert.equal(approval.status, 200);
  const started = await fetch(`${baseUrl}/api/planning/${proposal.id}/start`, json(manager, "POST", {}));
  assert.equal(started.status, 200);
  await advanceAuditToClosure(baseUrl, proposal.id, manager);
  const closed = await fetch(`${baseUrl}/api/planning/${proposal.id}/close`, json(manager, "POST", {}));
  assert.equal(closed.status, 200);

  const invalidComment = await fetch(`${baseUrl}/api/planning/${proposal.id}/comments`, json(auditor, "POST", { text: "  " }));
  assert.equal(invalidComment.status, 400);
  const oversizedComment = await fetch(`${baseUrl}/api/planning/${proposal.id}/comments`, json(auditor, "POST", { text: "x".repeat(2001) }));
  assert.equal(oversizedComment.status, 400);
  const commentText = "La evidencia solicitada está disponible en el expediente del área.";
  const commentResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}/comments`, json(auditor, "POST", { text: ` ${commentText} ` }));
  assert.equal(commentResponse.status, 201);
  const { comment } = await commentResponse.json();
  assert.equal(comment.text, commentText);
  assert.equal(comment.author.id, 5);
  assert.ok(comment.createdAt);

  const historyResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}/history`, json(auditor));
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_PROPOSAL_CREATED"));
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_PROPOSAL_UPDATED"));
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_PROPOSAL_APPROVED"));
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_STARTED"));
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_CLOSED"));
  assert.ok(history.history.some((entry) => entry.action === "AUDIT_COMMENT_ADDED"));
  assert.ok(history.history.every((entry) => entry.details.proposalId === proposal.id || entry.details.auditId === proposal.id));
  assert.equal(history.comments.length, 1);
  assert.equal(history.comments[0].id, comment.id);

  const jefaturaComment = await fetch(`${baseUrl}/api/planning/${proposal.id}/comments`, json(jefatura, "POST", { text: "Validación desde consulta de jefatura." }));
  assert.equal(jefaturaComment.status, 201);
  const forbiddenEntity = await fetch(`${baseUrl}/api/planning/AUD-999/history`, json(manager));
  assert.equal(forbiddenEntity.status, 404);
});
