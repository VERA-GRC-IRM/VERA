import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("HU-15: distingue vínculos, valoraciones preliminares y conserva el historial", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/planning**", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [{
    id: "RSK-15", title: "Conciliación", area: "Finanzas", level: "Medio"
  }] } }));
  await page.route("**/api/controls/**", (route) => route.fulfill({ json: { controls: [{
    id: "CTL-15", title: "Revisión mensual", description: "Control de conciliación mensual.",
    type: "DETECTIVE", frequency: "Monthly", ownerName: "Auditoría", ownerId: 5,
    riskIds: ["RSK-15"], effectiveness: 2, effectivenessResult: "INEFFECTIVE",
    evaluations: [
      { version: 1, rating: 4, result: "EFFECTIVE", note: "La muestra inicial no tenía diferencias.", assessedBy: { username: "qa" }, assessedAt: "2026-10-01T00:00:00Z" },
      { version: 2, rating: 2, result: "INEFFECTIVE", note: "La muestra nueva presenta excepciones.", assessedBy: { username: "qa" }, assessedAt: "2026-10-16T00:00:00Z" }
    ]
  }] } }));
  await page.route("**/api/findings/**", (route) => route.fulfill({ json: { findings: [] } }));
  await page.route("**/api/actions", (route) => route.fulfill({ json: { actions: [] } }));

  await page.goto("/controles");
  await expect(page.getByText("Riesgos con vínculo")).toBeVisible();
  await expect(page.getByText("Efectividad promedio")).toHaveCount(0);
  await expect(page.getByText("Un vínculo y una calificación preliminar no demuestran", { exact: false })).toBeVisible();
  const card = page.locator(".control-card").filter({ hasText: "Revisión mensual" });
  await expect(card).toContainText("Débil · 2/5");
  await card.locator("summary").click();
  await expect(card).toContainText("Versión 1 · calificación 4/5");
  await expect(card).toContainText("Versión 2 · calificación 2/5");
});

test("HU-15: auditor creates and evaluates a control and can start a linked finding", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  let control = null;
  let finding = null;
  const risk = { id: "RSK-16", title: "Riesgo asignado", area: "Finanzas", level: "Medio" };
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [risk] } }));
  await page.route("**/api/planning**", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/controls/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({ json: { controls: control ? [control] : [] } });
    }
    const body = request.postDataJSON();
    const assessedAt = "2026-11-10T12:00:00.000Z";
    const evaluation = { version: (control?.evaluations.length || 0) + 1,
      rating: body.rating, result: body.rating >= 4 ? "EFFECTIVE" : "INEFFECTIVE",
      note: body.note, assessedAt, assessedBy: { id: 5, username: "qa" } };
    if (request.url().endsWith("/evaluate")) {
      control = { ...control, effectiveness: body.rating, effectivenessResult: evaluation.result,
        evaluations: [...control.evaluations, evaluation] };
    } else {
      control = { ...body, id: "CTL-16", ownerName: "Cuenta de prueba",
        effectiveness: body.rating, effectivenessResult: evaluation.result,
        evaluations: [evaluation] };
    }
    return route.fulfill({ json: { control } });
  });
  await page.route("**/api/findings/**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { findings: finding ? [finding] : [] } });
    }
    const body = route.request().postDataJSON();
    finding = { ...body, id: "FDG-16", controlTitle: control.title, riskTitle: risk.title,
      assigneeId: 5, assigneeName: "Cuenta de prueba", evaluationVersion: control.evaluations.length,
      status: "OPEN", createdAt: "2026-11-10T12:01:00.000Z" };
    return route.fulfill({ json: { finding } });
  });
  await page.route("**/api/actions**", (route) => route.fulfill({ json: { actions: [] } }));
  await page.route("**/api/evidence**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { evidence: [] } });
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { evidence: { ...body, id: "EVD-16" } }, status: 201 });
  });

  await page.goto("/controles");
  await page.getByRole("button", { name: "Nuevo control" }).click();
  await page.getByLabel("Nombre del control").fill("Revisión asignada");
  await page.getByLabel("Descripción").fill("El auditor revisa y documenta las excepciones del proceso.");
  await page.locator(".risk-link-picker input[type=checkbox]").check();
  await page.getByLabel("Calificación preliminar").selectOption("4");
  await page.getByLabel("Justificación").fill("La muestra inicial confirma que el control opera adecuadamente.");
  await page.getByRole("button", { name: "Crear control" }).click();
  const card = page.locator(".control-card").filter({ hasText: "Revisión asignada" });
  await expect(card).toContainText("Efectivo");

  await card.getByRole("button", { name: "Evaluar" }).click();
  await page.getByLabel("Calificación preliminar").selectOption("2");
  await page.getByLabel("Justificación").fill("La nueva revisión encontró excepciones sin resolver.");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(card).toContainText("Inefectivo");
  await expect(page.getByRole("button", { name: /Registrar desde el control · CTL-16/ })).toBeVisible();

  await page.getByRole("button", { name: /Registrar desde el control · CTL-16/ }).click();
  const findingForm = page.locator('form[aria-label="Registrar hallazgo"]');
  await findingForm.getByLabel("Título").fill("Excepciones sin resolver");
  await findingForm.getByLabel("Descripción").fill("La revisión detectó diferencias que no cuentan con aprobación.");
  await findingForm.getByLabel("Causa raíz").fill("La conciliación no asigna responsable para resolver las diferencias.");
  await findingForm.getByLabel("Severidad").selectOption("HIGH");
  await findingForm.getByRole("button", { name: "Registrar hallazgo" }).click();
  const findingCard = page.locator(".finding-card").filter({ hasText: "Excepciones sin resolver" });
  await expect(findingCard).toContainText("Control CTL-16: Revisión asignada");
  await expect(findingCard).toContainText("Riesgo RSK-16: Riesgo asignado");
  await findingCard.getByRole("link", { name: "Adjuntar evidencia" }).click();
  await expect(page).toHaveURL(/entityType=FINDING&entityId=FDG-16/);
  const evidenceForm = page.locator("form.evidence-modal");
  await expect(evidenceForm.getByLabel("Vincular con")).toHaveValue("FINDING");
  await expect(evidenceForm.getByLabel("Elemento relacionado")).toHaveValue("FDG-16");
  await evidenceForm.getByLabel("Nombre").fill("Respaldo de la excepción");
  await evidenceForm.getByLabel("Descripción").fill("Referencia de soporte para la desviación documentada.");
  await evidenceForm.getByLabel("Enlace HTTPS o identificador externo").fill("Drive/finding-evidence-16");
  await evidenceForm.getByRole("button", { name: "Guardar referencia" }).click();
  await expect(page.getByText("Referencia de evidencia registrada y vinculada.")).toBeVisible();
});

test("HU-15: only an independent Super Admin can approve or reject finding closure", async ({ page }) => {
  await useSession(page, "SUPER_ADMIN", 1);
  const findings = ["FDG-REJECT", "FDG-APPROVE"].map((id) => ({
    id, title: `Validación ${id}`, description: "La desviación documentada tiene acciones terminadas y evidencia.",
    rootCause: "La revisión no identificaba responsables de las excepciones.",
    severity: "MEDIUM", assigneeId: 4, assigneeName: "Jefatura",
    status: "PENDING_VALIDATION", storageVersion: 1,
    createdAt: "2026-11-10T12:00:00.000Z",
    createdBy: { id: 3, username: "gerente" },
    closureRequest: { note: "Las acciones se completaron y se presenta evidencia.",
      requestedBy: { id: 5, username: "auditor" } }
  }));
  await page.route("**/api/risks/owners", (route) => route.fulfill({ json: { owners: [] } }));
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [] } }));
  await page.route("**/api/controls/**", (route) => route.fulfill({ json: { controls: [] } }));
  await page.route("**/api/planning**", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/actions**", (route) => route.fulfill({ json: { actions: [] } }));
  await page.route("**/api/findings/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { findings } });
    const id = route.request().url().split("/").at(-2);
    const decision = route.request().postDataJSON();
    const finding = findings.find((item) => item.id === id);
    finding.status = decision.decision === "APPROVE" ? "CLOSED" : "OPEN";
    finding.storageVersion += 1;
    finding.closureDecision = { decision: decision.decision, note: decision.note,
      decidedAt: "2026-11-10T12:05:00.000Z", decidedBy: { id: 1, username: "qa" } };
    finding.closureHistory = [finding.closureDecision];
    if (decision.decision === "APPROVE") {
      finding.closedAt = finding.closureDecision.decidedAt;
      finding.closedBy = finding.closureDecision.decidedBy;
    } else {
      finding.closureRequest = null;
    }
    return route.fulfill({ json: { finding } });
  });

  await page.goto("/controles");
  const rejectedCard = page.locator(".finding-card").filter({ hasText: "FDG-REJECT" });
  await rejectedCard.getByRole("button", { name: "Rechazar cierre" }).click();
  const reviewForm = page.locator('form[aria-label="Validar cierre"]');
  await expect(reviewForm.getByLabel("Motivo del rechazo")).toHaveAttribute("required", "");
  await reviewForm.getByLabel("Motivo del rechazo").fill("La evidencia todavía no cubre las diferencias.");
  await reviewForm.getByRole("button", { name: "Confirmar rechazo" }).click();
  await expect(rejectedCard).toContainText("Cierre rechazado por qa");
  await expect(rejectedCard).toContainText("La evidencia todavía no cubre las diferencias.");

  const approvedCard = page.locator(".finding-card").filter({ hasText: "FDG-APPROVE" });
  await approvedCard.getByRole("button", { name: "Aprobar cierre" }).click();
  const approvalForm = page.locator('form[aria-label="Validar cierre"]');
  await approvalForm.getByLabel("Observación (opcional)").fill("Verificado.");
  await approvalForm.getByRole("button", { name: "Confirmar aprobación" }).click();
  await expect(approvedCard).toContainText("Cierre aprobado por qa");
  await expect(approvedCard).toContainText("Cerrado");
});
