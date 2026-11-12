const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "planning-integration-test-secret-32-characters";

const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const withServer = async (context, callback) => {
  return callback(await startTestServer(context, app));
};

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    ...(body ? { "Content-Type": "application/json" } : {})
  },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("HU-22: create, edit, validate duplicate and approve an audit proposal", async (context) => {
  await withServer(context, async (baseUrl) => {
    const directorToken = tokenFor(3);
    const title = `HU-22 integration ${Date.now()}`;
    const initial = {
      title,
      objective: "Verificar el diseño y la operación de controles.",
      scope: "Procesos de compras y autorizaciones.",
      justification: "Los hallazgos previos requieren seguimiento.",
      area: "Operaciones",
      type: "Interna",
      risk: "Alto",
      year: 2026,
      startDate: "2026-04-01",
      endDate: "2026-06-30"
    };

    const invalid = await fetch(`${baseUrl}/api/planning`, json(directorToken, "POST", {
      ...initial,
      objective: ""
    }));
    assert.equal(invalid.status, 400);
    for (const incomplete of [
      { ...initial, scope: "" },
      { ...initial, justification: "" },
      { ...initial, startDate: "", endDate: "" }
    ]) {
      const response = await fetch(`${baseUrl}/api/planning`, json(directorToken, "POST", incomplete));
      assert.equal(response.status, 400);
    }

    const createdResponse = await fetch(`${baseUrl}/api/planning`, json(directorToken, "POST", initial));
    assert.equal(createdResponse.status, 201);
    const { proposal } = await createdResponse.json();
    assert.equal(proposal.title, title);
    assert.equal(proposal.scope, initial.scope);
    assert.equal(proposal.justification, initial.justification);
    assert.equal(proposal.startDate, "2026-04-01");
    assert.equal(proposal.endDate, "2026-06-30");
    assert.equal(proposal.status, "OPEN");
    assert.equal(proposal.approval, 0);

    const duplicateResponse = await fetch(`${baseUrl}/api/planning`, json(directorToken, "POST", initial));
    assert.equal(duplicateResponse.status, 409);

    const updateResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(directorToken, "PUT", {
      ...initial,
      title: `${title} editada`
    }));
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).proposal.title, `${title} editada`);

    const missingQuarter = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(directorToken, "POST", {}));
    assert.equal(missingQuarter.status, 400);

    const approvedResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(directorToken, "POST", { quarter: "Q3" }));
    assert.equal(approvedResponse.status, 200);
    const approved = (await approvedResponse.json()).proposal;
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.approval, 100);
    assert.equal(approved.quarter, "Q3");
    assert.ok(approved.approvedAt);

    const immutableResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(directorToken, "PUT", initial));
    assert.equal(immutableResponse.status, 409);
  });
});

test("HU-22: only authorized roles can create proposals and anonymous users cannot query them", async (context) => {
  await withServer(context, async (baseUrl) => {
    const auditorToken = tokenFor(5);
    const forbidden = await fetch(`${baseUrl}/api/planning`, json(auditorToken, "POST", {
      title: "No autorizado",
      objective: "No debe crearse",
      area: "Tecnología"
    }));
    assert.equal(forbidden.status, 403);

    const anonymous = await fetch(`${baseUrl}/api/planning`);
    assert.equal(anonymous.status, 401);

    const managerToken = tokenFor(3);
    const created = await fetch(`${baseUrl}/api/planning`, json(managerToken, "POST", {
      title: `HU-22 approval role ${Date.now()}`,
      objective: "Verificar separación entre propuesta y aprobación.",
      scope: "Planeación anual.",
      justification: "Priorizar la revisión de procesos.",
      area: "Tecnología",
      year: 2026,
      quarter: "Q1"
    }));
    assert.equal(created.status, 201);
    const proposal = (await created.json()).proposal;
    const cannotApprove = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(tokenFor(2), "POST", { quarter: "Q1" }));
    assert.equal(cannotApprove.status, 403);

    const deniedDeletion = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(tokenFor(2), "DELETE"));
    assert.equal(deniedDeletion.status, 403);
    const deleted = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(tokenFor(1), "DELETE"));
    assert.equal(deleted.status, 200);
  });
});

test("HU-11: jefatura proposes and edits own work; approval and deletion remain separated", async (context) => {
  await withServer(context, async (baseUrl) => {
    const jefatura = tokenFor(4);
    const auditor = tokenFor(5);
    const manager = tokenFor(3);
    const director = tokenFor(2);
    const admin = tokenFor(1);
    const body = {
      title: `HU-11 jefatura ${Date.now()}`,
      objective: "Comprobar el alcance de una auditoría propuesta.",
      scope: "Procesos de compras.",
      justification: "La matriz permite crear a jefatura.",
      area: "Compras",
      year: 2026,
      quarter: "Q2"
    };

    assert.equal((await fetch(`${baseUrl}/api/planning/auditors`, json(jefatura))).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/planning`, json(auditor, "POST", body))).status, 403);
    const createdResponse = await fetch(`${baseUrl}/api/planning`, json(jefatura, "POST", body));
    assert.equal(createdResponse.status, 201);
    const proposal = (await createdResponse.json()).proposal;
    assert.equal(proposal.createdBy.id, 4);
    assert.equal(proposal.status, "OPEN");

    const ownEdit = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(jefatura, "PUT", { ...body, objective: "Comprobar compras y autorizaciones." }));
    assert.equal(ownEdit.status, 200);
    assert.equal((await ownEdit.json()).proposal.objective, "Comprobar compras y autorizaciones.");
    assert.equal((await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(jefatura, "POST", { quarter: "Q2" }))).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/planning/${proposal.id}/start`, json(jefatura, "POST", {}))).status, 403);
    for (const token of [jefatura, director]) {
      assert.equal((await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(token, "DELETE"))).status, 403);
    }

    const otherResponse = await fetch(`${baseUrl}/api/planning`, json(manager, "POST", { ...body, title: `${body.title} otro` }));
    assert.equal(otherResponse.status, 201);
    const other = (await otherResponse.json()).proposal;
    assert.equal((await fetch(`${baseUrl}/api/planning/${other.id}`, json(jefatura, "PUT", body))).status, 403);

    const approved = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(manager, "POST", { quarter: "Q2" }));
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).proposal.status, "APPROVED");
    const started = await fetch(`${baseUrl}/api/planning/${proposal.id}/start`, json(manager, "POST", {}));
    assert.equal(started.status, 200);
    assert.equal((await started.json()).audit.status, "ACTIVE");
    assert.equal((await fetch(`${baseUrl}/api/planning/${other.id}`, json(admin, "DELETE"))).status, 200);
  });
});

test("HU-23: rejection requires a reason, records the decision and makes the proposal terminal", async (context) => {
  await withServer(context, async (baseUrl) => {
    const directorToken = tokenFor(2);
    const managerToken = tokenFor(3);
    const proposalBody = {
      title: `HU-23 rejection ${Date.now()}`,
      objective: "Asegurar que la decisión de rechazo sea trazable.",
      scope: "Proceso financiero.",
      justification: "Se requiere una decisión documentada.",
      area: "Finanzas",
      year: 2026,
      quarter: "Q2"
    };
    const createdResponse = await fetch(`${baseUrl}/api/planning`, json(managerToken, "POST", proposalBody));
    assert.equal(createdResponse.status, 201);
    const proposal = (await createdResponse.json()).proposal;

    const unauthorized = await fetch(`${baseUrl}/api/planning/${proposal.id}/reject`, json(directorToken, "POST", { reason: "No procede" }));
    assert.equal(unauthorized.status, 403);

    const missingReason = await fetch(`${baseUrl}/api/planning/${proposal.id}/reject`, json(managerToken, "POST", { reason: "   " }));
    assert.equal(missingReason.status, 400);

    const reason = "Falta delimitar el alcance y los controles que se revisarán.";
    const rejectedResponse = await fetch(`${baseUrl}/api/planning/${proposal.id}/reject`, json(managerToken, "POST", { reason }));
    assert.equal(rejectedResponse.status, 200);
    const rejected = (await rejectedResponse.json()).proposal;
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, reason);
    assert.equal(rejected.rejectedBy.name, "gerente");
    assert.ok(rejected.rejectedAt);

    const repeated = await fetch(`${baseUrl}/api/planning/${proposal.id}/reject`, json(managerToken, "POST", { reason }));
    assert.equal(repeated.status, 409);
    const edit = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(managerToken, "PUT", proposalBody));
    assert.equal(edit.status, 409);
    const approve = await fetch(`${baseUrl}/api/planning/${proposal.id}/approve`, json(managerToken, "POST", { quarter: "Q2" }));
    assert.equal(approve.status, 409);
    const forbiddenRemove = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(directorToken, "DELETE"));
    assert.equal(forbiddenRemove.status, 403);
    const terminalRemove = await fetch(`${baseUrl}/api/planning/${proposal.id}`, json(tokenFor(1), "DELETE"));
    assert.equal(terminalRemove.status, 409);
  });
});

test("HU-09: risk is derived from probability and impact; approved audits follow start and close transitions", async (context) => {
  await withServer(context, async (baseUrl) => {
    const directorToken = tokenFor(2);
    const managerToken = tokenFor(3);
    const body = {
      title: `HU-09 lifecycle ${Date.now()}`,
      objective: "Revisar exposición y ejecutar el programa aprobado.",
      scope: "Operaciones críticas.",
      justification: "La exposición requiere seguimiento.",
      area: "Operaciones",
      year: 2026,
      quarter: "Q2",
      likelihood: 3,
      impact: 2
    };
    const invalidRisk = await fetch(`${baseUrl}/api/planning`, json(managerToken, "POST", { ...body, likelihood: 4 }));
    assert.equal(invalidRisk.status, 400);

    const createdResponse = await fetch(`${baseUrl}/api/planning`, json(managerToken, "POST", body));
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).proposal;
    assert.equal(created.workflowStep, "start");
    assert.equal(created.riskScore, 6);
    assert.equal(created.risk, "Alto");

    const prematureStart = await fetch(`${baseUrl}/api/planning/${created.id}/start`, json(managerToken, "POST", {}));
    assert.equal(prematureStart.status, 409);
    const prematureClose = await fetch(`${baseUrl}/api/planning/${created.id}/close`, json(managerToken, "POST", {}));
    assert.equal(prematureClose.status, 409);

    const approval = await fetch(`${baseUrl}/api/planning/${created.id}/approve`, json(managerToken, "POST", { quarter: "Q2" }));
    assert.equal(approval.status, 200);

    const unauthorizedStart = await fetch(`${baseUrl}/api/planning/${created.id}/start`, json(directorToken, "POST", {}));
    assert.equal(unauthorizedStart.status, 403);
    const startResponse = await fetch(`${baseUrl}/api/planning/${created.id}/start`, json(managerToken, "POST", {}));
    assert.equal(startResponse.status, 200);
    const active = (await startResponse.json()).audit;
    assert.equal(active.status, "ACTIVE");
    assert.equal(active.workflowStep, "start");
    assert.equal(active.progress, 0);
    assert.ok(active.startedAt);

    const activeList = await fetch(`${baseUrl}/api/planning/active`, json(directorToken));
    assert.ok((await activeList.json()).audits.some((audit) => audit.id === created.id));
    const repeatedStart = await fetch(`${baseUrl}/api/planning/${created.id}/start`, json(managerToken, "POST", {}));
    assert.equal(repeatedStart.status, 409);

    const closeBeforeClosure = await fetch(
      `${baseUrl}/api/planning/${created.id}/close`,
      json(managerToken, "POST", {})
    );
    assert.equal(closeBeforeClosure.status, 409);

    const skipToClosure = await fetch(
      `${baseUrl}/api/planning/${created.id}/workflow-step`,
      json(managerToken, "PATCH", { step: "closure" })
    );
    assert.equal(skipToClosure.status, 409);

    for (const step of ["kickoff", "understanding", "execution", "supervision", "closure"]) {
      const stepResponse = await fetch(
        `${baseUrl}/api/planning/${created.id}/workflow-step`,
        json(managerToken, "PATCH", { step })
      );
      assert.equal(stepResponse.status, 200, `No se pudo avanzar a ${step}`);
    }

    const findingResponse = await fetch(
      `${baseUrl}/api/findings`,
      json(managerToken, "POST", {
        auditId: created.id,
        title: `Hallazgo HU-24 ${Date.now()}`,
        description: "Hallazgo abierto para probar la validación del cierre.",
        rootCause: "La revisión detectó una causa pendiente de seguimiento.",
        severity: "HIGH",
        responsibleId: 3
      })
    );
    assert.equal(findingResponse.status, 201);
    const finding = (await findingResponse.json()).finding;

    const closeWithoutFollowUp = await fetch(
      `${baseUrl}/api/planning/${created.id}/close`,
      json(managerToken, "POST", {})
    );
    assert.equal(closeWithoutFollowUp.status, 409);

    const followUpResponse = await fetch(
      `${baseUrl}/api/actions`,
      json(managerToken, "POST", {
        sourceType: "FINDING",
        sourceId: finding.id,
        title: "Dar seguimiento al hallazgo",
        rationale: "Documentar la corrección y revisar el resultado.",
        dueDate: "2026-12-31",
        assigneeId: 3
      })
    );
    assert.equal(followUpResponse.status, 201);

    const closeResponse = await fetch(
      `${baseUrl}/api/planning/${created.id}/close`,
      json(managerToken, "POST", {})
    );
    assert.equal(closeResponse.status, 200);

    const closed = (await closeResponse.json()).audit;
    assert.equal(closed.status, "CLOSED");
    assert.equal(closed.progress, 100);
    assert.ok(closed.closedAt);
    const noLongerActive = await fetch(`${baseUrl}/api/planning/active`, json(directorToken));
    assert.ok(!(await noLongerActive.json()).audits.some((audit) => audit.id === created.id));
    const repeatedClose = await fetch(`${baseUrl}/api/planning/${created.id}/close`, json(managerToken, "POST", {}));
    assert.equal(repeatedClose.status, 409);
    const editClosed = await fetch(`${baseUrl}/api/planning/${created.id}`, json(managerToken, "PUT", body));
    assert.equal(editClosed.status, 409);
  });
});
