import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

const stubGovernanceContext = async (page, { includeRecords = true, riskCount = 1 } = {}) => {
  const audit = {
    id: "AUD-451", title: "Auditoría operativa", objective: "Revisar controles",
    area: "Operaciones", responsible: "Gerente", responsibleId: 3, likelihood: 3, impact: 2,
    status: "ACTIVE", workflowStep: "understanding", startedAt: "2026-10-01T00:00:00.000Z"
  };
  const control = {
    id: "CTL-451", title: "Revisión mensual", description: "Validación mensual del expediente.",
    type: "DETECTIVE", frequency: "Monthly", ownerId: 3, ownerName: "Gerente",
    riskIds: ["RSK-451"], effectiveness: 2, storageVersion: 1,
    updatedAt: "2026-10-01T00:00:00.000Z"
  };
  const finding = {
    id: "FDG-451", title: "Excepción de conciliación",
    description: "La revisión detectó una diferencia.", rootCause: "Falta una validación independiente.",
    severity: "MEDIUM", responsibleId: 3, responsibleName: "Gerente",
    auditId: audit.id, riskId: "RSK-451", controlId: control.id, evidenceIds: [],
    status: "OPEN", storageVersion: 1
  };
  const controls = includeRecords ? [control] : [];
  const findings = includeRecords ? [finding] : [];
  const risks = Array.from({ length: riskCount }, (_, index) => ({
    id: `RSK-${451 + index}`, title: index === 0 ? "Riesgo operativo" : `Riesgo operativo ${index + 1}`,
    linkedAuditId: audit.id
  }));
  await page.route("**/api/planning/active", (route) => route.fulfill({ json: { audits: [audit] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [audit] } }));
  await page.route("**/api/risks**", (route) => route.fulfill({
    json: route.request().url().endsWith("/owners")
      ? { owners: [{ id: 3, name: "Gerente" }] }
      : { risks }
  }));
  await page.route("**/api/controls**", async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      const current = controls.find((item) => item.id === new URL(route.request().url()).pathname.split("/").pop());
      const updated = { ...current, ...route.request().postDataJSON(),
        storageVersion: current.storageVersion + 1, updatedAt: "2026-10-02T00:00:00.000Z" };
      controls[controls.indexOf(current)] = updated;
      return route.fulfill({ json: { control: updated } });
    }
    if (method === "POST") {
      const body = route.request().postDataJSON();
      const created = { id: "CTL-452", ...body, ownerName: "Gerente",
        effectiveness: body.rating, storageVersion: 1, updatedAt: "2026-10-01T00:00:00.000Z" };
      controls.push(created);
      return route.fulfill({ status: 201, json: { control: created } });
    }
    return route.fulfill({ json: { controls } });
  });
  await page.route("**/api/findings**", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const current = findings.find((item) => item.id === new URL(route.request().url()).pathname.split("/").pop());
      const updated = { ...current, ...route.request().postDataJSON(), storageVersion: current.storageVersion + 1 };
      findings[findings.indexOf(current)] = updated;
      return route.fulfill({ json: { finding: updated } });
    }
    if (method === "POST") {
      const created = { id: "FDG-452", status: "OPEN", storageVersion: 1, ...route.request().postDataJSON() };
      findings.push(created);
      return route.fulfill({ status: 201, json: { finding: created } });
    }
    return route.fulfill({ json: { findings } });
  });
  await page.route("**/api/evidence**", (route) => route.fulfill({ json: { evidence: [] } }));
  await page.route("**/api/planning/AUD-451/context", (route) => route.fulfill({ json: {
    audit: { id: audit.id, title: audit.title, status: audit.status },
    groups: {
      risks,
      controls,
      findings,
      evidence: []
    },
    counts: { risks: risks.length, controls: controls.length, findings: findings.length, evidence: 0 },
    asOf: "2026-10-01T00:00:00.000Z", scope: "Relaciones del expediente", mode: "read-only"
  } }));
};

test("HU-09: matrix selection reveals linked risks, controls and audit navigation", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  const audit = {
    id: "AUD-451", title: "Auditoría operativa", objective: "Revisar controles",
    area: "Operaciones", responsible: "Auditora", likelihood: 3, impact: 2,
    status: "ACTIVE", startedAt: "2026-10-01T00:00:00.000Z"
  };
  await page.route("**/api/planning/active", (route) => route.fulfill({ json: { audits: [audit] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [audit] } }));
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [{
    id: "RSK-451", title: "Riesgo operativo", description: "Exposición registrada",
    linkedAuditId: audit.id, level: "Alto", score: 6
  }] } }));
  await page.route("**/api/controls/**", (route) => route.fulfill({ json: { controls: [{
    id: "CTL-451", title: "Revisión mensual", riskIds: ["RSK-451"], effectiveness: 4
  }] } }));
  await page.route("**/api/evidence/**", (route) => route.fulfill({ json: { evidence: [] } }));
  await page.route("**/api/findings/**", (route) => route.fulfill({ json: { findings: [{
    id: "FDG-451", title: "Excepción de conciliación", description: "La revisión detectó una diferencia.",
    auditId: audit.id, riskId: "RSK-451", controlId: "CTL-451", status: "OPEN"
  }] } }));
  await page.route("**/api/planning/AUD-451/context", (route) => route.fulfill({ json: {
    audit: { id: audit.id, title: audit.title, status: audit.status },
    groups: {
      risks: [{ id: "RSK-451", title: "Riesgo operativo", description: "Exposición registrada", level: "Alto", score: 6 }],
      controls: [{ id: "CTL-451", title: "Revisión mensual", riskIds: ["RSK-451"], effectiveness: 4 }],
      findings: [{ id: "FDG-451", title: "Excepción de conciliación", description: "La revisión detectó una diferencia.", riskId: "RSK-451", controlId: "CTL-451", status: "OPEN" }],
      evidence: []
    },
    counts: { risks: 1, controls: 1, findings: 1, evidence: 0 },
    asOf: "2026-10-01T00:00:00.000Z", scope: "Relaciones del expediente", mode: "read-only"
  } }));

  await page.goto("/auditorias-activas");
  await page.getByRole("button", { name: "Ver auditorías con probabilidad Alta e impacto Media: 1" }).click();

  const detail = page.getByRole("region", { name: "Detalle de la celda seleccionada" });
  await expect(detail.getByText("Riesgo operativo")).toBeVisible();
  await expect(detail.getByText(/Revisión mensual.*4\/5/)).toBeVisible();
  await detail.getByRole("button", { name: "Abrir expediente" }).click();
  await expect(page).toHaveURL(/\/auditorias-activas\/AUD-451$/);

  const workspace = page.getByRole("dialog", { name: "Auditoría operativa" });
  await expect(workspace).toBeVisible();
  await workspace.getByRole("button", { name: /Riesgos/ }).click();
  await expect(workspace.getByText("RSK-451 · Riesgo operativo")).toBeVisible();
  await workspace.getByRole("button", { name: /Controles/ }).click();
  await expect(workspace.getByText("CTL-451 · Revisión mensual")).toBeVisible();
  await workspace.getByRole("button", { name: /Hallazgos/ }).click();
  await expect(workspace.getByText("FDG-451 · Excepción de conciliación")).toBeVisible();
  await workspace.getByRole("button", { name: "Volver a auditorías" }).click();
  await expect(page).toHaveURL(/\/auditorias-activas$/);
  await expect(workspace).toHaveCount(0);
});

test("RF-24: Gerencia edita controles y hallazgos desde sus pestañas del expediente", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await stubGovernanceContext(page);
  await page.goto("/auditorias-activas/AUD-451");
  const workspace = page.getByRole("dialog", { name: "Auditoría operativa" });
  await workspace.getByRole("button", { name: /Controles/ }).click();
  await workspace.getByRole("button", { name: "Editar" }).click();
  await expect(workspace.getByRole("option", { name: "Gerente" })).toBeAttached();
  await workspace.getByLabel("Nombre del control").fill("Revisión reforzada");
  await workspace.getByRole("button", { name: "Guardar control" }).click();
  await expect(page.getByText("Control CTL-451 actualizado.")).toBeVisible();
  await expect(workspace.getByText("CTL-451 · Revisión reforzada")).toBeVisible();

  await workspace.getByRole("button", { name: /Hallazgos/ }).click();
  await workspace.getByRole("button", { name: "Editar" }).click();
  await workspace.getByLabel("Título", { exact: true }).fill("Excepción prioritaria");
  await workspace.getByLabel("Severidad").selectOption("HIGH");
  await workspace.getByRole("button", { name: "Guardar hallazgo" }).click();
  await expect(page.getByText("Hallazgo FDG-451 actualizado.")).toBeVisible();
  await expect(workspace.getByText("FDG-451 · Excepción prioritaria")).toBeVisible();
});

test("Gerencia puede registrar controles y hallazgos desde el expediente con riesgos vinculados", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await stubGovernanceContext(page, { includeRecords: false, riskCount: 2 });
  await page.goto("/auditorias-activas/AUD-451");
  const workspace = page.getByRole("dialog", { name: "Auditoría operativa" });

  await workspace.getByRole("button", { name: /Controles/ }).click();
  await expect(workspace.getByText("No hay controles vinculados a los riesgos de esta auditoría.")).toBeVisible();
  await workspace.getByRole("button", { name: "Agregar control" }).click();
  await workspace.getByLabel("Nombre del control").fill("Revisión de conciliación");
  await workspace.getByLabel("Descripción").fill("Validación mensual de las conciliaciones operativas.");
  await workspace.getByLabel("Riesgo asociado").selectOption("RSK-452");
  await workspace.locator("form.governance-inline-editor").getByRole("combobox").nth(3).selectOption("3");
  await workspace.getByLabel("Efectividad inicial").selectOption("2");
  await workspace.getByLabel("Justificación de la evaluación").fill("La muestra presentó excepciones sin resolver.");
  await workspace.getByRole("button", { name: "Guardar control" }).click();
  await expect(page.getByText("Control CTL-452 registrado en el expediente.")).toBeVisible();
  await expect(workspace.getByText("CTL-452 · Revisión de conciliación")).toBeVisible();

  await workspace.getByRole("button", { name: /Hallazgos/ }).click();
  await workspace.getByRole("button", { name: "Agregar hallazgo" }).click();
  await workspace.getByLabel("Título", { exact: true }).fill("Excepción de conciliación");
  await workspace.getByLabel("Descripción").fill("La revisión encontró diferencias que no fueron aprobadas.");
  await workspace.getByLabel("Causa raíz").fill("El proceso no asigna responsables para revisar las diferencias.");
  await workspace.getByLabel("Riesgo asociado").selectOption("RSK-452");
  await workspace.getByLabel("Control relacionado (opcional)").selectOption("CTL-452");
  await workspace.locator("form.governance-inline-editor").getByRole("combobox").nth(3).selectOption("3");
  await workspace.getByRole("button", { name: "Guardar hallazgo" }).click();
  await expect(page.getByText("Hallazgo FDG-452 registrado en el expediente.")).toBeVisible();
  await expect(workspace.getByText("FDG-452 · Excepción de conciliación")).toBeVisible();
});

test("RF-24: los usuarios sin permiso no reciben acciones de edición", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubGovernanceContext(page);
  await page.goto("/auditorias-activas/AUD-451");
  const workspace = page.getByRole("dialog", { name: "Auditoría operativa" });
  await workspace.getByRole("button", { name: /Controles/ }).click();
  await expect(workspace.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await workspace.getByRole("button", { name: /Hallazgos/ }).click();
  await expect(workspace.getByRole("button", { name: "Editar" })).toHaveCount(0);
});
