const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "risks-integration-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const json = (token, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const withServer = async (context, callback) => {
  return callback(await startTestServer(context, app));
};

test("HU-14: risk registration validates fields, calculates level and retains evaluation history", async (context) => {
  await withServer(context, async (baseUrl) => {
    const manager = tokenFor(3);
    const auditor = tokenFor(5);
    const anonymous = await fetch(`${baseUrl}/api/risks`);
    assert.equal(anonymous.status, 401);

    const body = {
      title: `HU-14 riesgo ${Date.now()}`,
      description: "La falta de revisión oportuna puede permitir errores materiales.",
      area: "Finanzas",
      ownerId: 5,
      linkedAuditId: "AUD-01",
      responsePlan: "Revisar controles mensualmente y asignar un responsable alterno.",
      likelihood: 3,
      impact: 2,
      note: "Se observó una brecha reciente en la revisión de controles."
    };
    const invalid = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", { ...body, likelihood: 4 }));
    assert.equal(invalid.status, 400);
    const createdResponse = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", body));
    assert.equal(createdResponse.status, 201);
    const { risk } = await createdResponse.json();
    assert.equal(risk.score, 6);
    assert.equal(risk.level, "Alto");
    assert.equal(risk.methodId, "legacy-3x3-v1");
    assert.equal(risk.assessmentStage, "UNSPECIFIED");
    assert.equal(risk.evaluations[0].methodId, "legacy-3x3-v1");
    assert.equal(risk.status, "OPEN");
    assert.equal(risk.linkedAuditId, "AUD-01");
    assert.equal(risk.evaluations.length, 1);
    assert.equal(risk.evaluations[0].note, body.note);
    assert.ok(risk.evaluations[0].assessedAt);

    const duplicate = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", { ...body, title: body.title.toUpperCase() }));
    assert.equal(duplicate.status, 409);
    const missingAudit = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", {
      ...body,
      title: `${body.title} sin auditoría`,
      linkedAuditId: "AUD-999"
    }));
    assert.equal(missingAudit.status, 404);
    const noJustification = await fetch(`${baseUrl}/api/risks/${risk.id}/evaluate`, json(manager, "POST", { likelihood: 1, impact: 1, note: "corta" }));
    assert.equal(noJustification.status, 400);

    const evaluationNote = "Se implementó una mitigación y bajó la probabilidad observada.";
    const evaluationResponse = await fetch(`${baseUrl}/api/risks/${risk.id}/evaluate`, json(manager, "POST", { likelihood: 1, impact: 2, note: evaluationNote }));
    assert.equal(evaluationResponse.status, 200);
    const reevaluated = (await evaluationResponse.json()).risk;
    assert.equal(reevaluated.score, 2);
    assert.equal(reevaluated.level, "Bajo");
    assert.equal(reevaluated.evaluations.length, 2);
    assert.equal(reevaluated.evaluations[1].version, 2);
    assert.equal(reevaluated.evaluations[1].methodId, "legacy-3x3-v1");
    assert.equal(reevaluated.evaluations[1].note, evaluationNote);
    assert.equal(reevaluated.evaluations[1].assessedBy.id, 3);

    const visible = await fetch(`${baseUrl}/api/risks`, json(auditor));
    assert.ok((await visible.json()).risks.some((item) => item.id === risk.id));
    const forbidden = await fetch(`${baseUrl}/api/risks/${risk.id}/evaluate`, json(auditor, "POST", { likelihood: 1, impact: 1, note: evaluationNote }));
    assert.equal(forbidden.status, 403);
    const methods = await fetch(`${baseUrl}/api/risks/methods`, json(auditor));
    assert.equal(methods.status, 200);
    assert.equal((await methods.json()).methods[0].approvedEnterprisePolicy, false);
    assert.equal((await fetch(`${baseUrl}/api/risks/methods`)).status, 401);
    const unapproved = await fetch(`${baseUrl}/api/risks/${risk.id}/evaluate`, json(manager, "POST", {
      likelihood: 1, impact: 1, note: evaluationNote, assessmentStage: "RESIDUAL"
    }));
    assert.equal(unapproved.status, 400);
    const update = await fetch(`${baseUrl}/api/risks/${risk.id}`, json(manager, "PUT", { ...body, title: `${body.title} actualizado` }));
    assert.equal(update.status, 200);
    assert.equal((await update.json()).risk.title, `${body.title} actualizado`);
  });
});

test("HU-14: auditors only see risks assigned to them; active managers can manage the register", async (context) => {
  await withServer(context, async (baseUrl) => {
    const director = tokenFor(2);
    const manager = tokenFor(3);
    const body = {
      title: `HU-14 scope ${Date.now()}`,
      description: "Exposición de prueba para comprobar el alcance del registro.",
      area: "Operaciones",
      ownerId: 4,
      likelihood: 2,
      impact: 2,
      note: "La exposición se mantiene moderada con los controles existentes."
    };
    assert.equal((await fetch(`${baseUrl}/api/risks`, json(director, "POST", body))).status, 403);
    const createdResponse = await fetch(`${baseUrl}/api/risks`, json(manager, "POST", body));
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).risk;
    const auditorResponse = await fetch(`${baseUrl}/api/risks`, json(tokenFor(5)));
    assert.ok(!(await auditorResponse.json()).risks.some((risk) => risk.id === created.id));

    const unauthorized = await fetch(`${baseUrl}/api/risks`, json(tokenFor(4), "POST", { ...body, title: `${body.title} intento` }));
    assert.equal(unauthorized.status, 403);
    const filtered = await fetch(`${baseUrl}/api/risks?level=Medio&search=${encodeURIComponent(body.area)}`, json(director));
    assert.ok((await filtered.json()).risks.some((risk) => risk.id === created.id));
    const byArea = await fetch(`${baseUrl}/api/risks?level=Medio&area=operaciones`, json(director));
    const exact = (await byArea.json()).risks;
    assert.ok(exact.some((risk) => risk.id === created.id));
    assert.ok(exact.every((risk) => risk.area.toLowerCase() === "operaciones"));
  });
});
