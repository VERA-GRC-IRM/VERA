import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("risk creation chooses only a manageable entity or inherits the linked audit", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const unitId = "ORG-11111111-1111-4111-8111-111111111111";
  const viewOnlyId = "ORG-22222222-2222-4222-8222-222222222222";
  const created = [];
  const requests = [];

  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [
    { id: unitId, code: "LE_A", name: "Entidad A", accessLevel: "MANAGE" },
    { id: viewOnlyId, code: "LE_B", name: "Entidad B", accessLevel: "VIEW" }
  ] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [
    { id: "AUD-100", title: "Auditoría A", status: "ACTIVE", orgUnitId: unitId }
  ] } }));
  await page.route("**/api/risks/**", (route) => {
    if (route.request().url().endsWith("/owners")) {
      return route.fulfill({ json: { owners: [{ id: 3, name: "Gerencia", role: "GERENTE" }] } });
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      requests.push(body);
      const risk = { ...body, id: `RSK-${requests.length}`, level: "Medio", score: 4,
        ownerName: "Gerencia", evaluations: [] };
      created.push(risk);
      return route.fulfill({ status: 201, json: { risk } });
    }
    return route.fulfill({ json: { risks: created } });
  });

  await page.goto("/riesgos");
  await page.getByRole("button", { name: "Registrar riesgo" }).click();
  const form = page.locator("form.risk-modal");
  const scope = form.getByLabel("Ámbito empresarial");
  await expect(scope.locator("option")).toHaveCount(2);
  await scope.selectOption(unitId);
  await form.getByLabel("Nombre del riesgo").fill("Riesgo independiente A");
  await form.getByLabel("Descripción").fill("Descripción sintética del riesgo en entidad A.");
  await form.getByLabel("Área", { exact: true }).fill("Operaciones");
  await form.getByLabel("Responsable").selectOption("3");
  await form.getByLabel("Justificación de la evaluación").fill("Evaluación inicial de ejemplo.");
  await form.getByRole("button", { name: "Crear riesgo" }).click();
  await expect(page.getByText("Riesgo registrado.")).toBeVisible();
  expect(requests[0].orgUnitId).toBe(unitId);

  await page.getByRole("button", { name: "Registrar riesgo" }).click();
  const linkedForm = page.locator("form.risk-modal");
  await linkedForm.getByLabel("Auditoría relacionada (opcional)").selectOption("AUD-100");
  await expect(linkedForm.getByLabel("Ámbito empresarial")).toHaveValue("Entidad A");
  await linkedForm.getByLabel("Nombre del riesgo").fill("Riesgo de auditoría A");
  await linkedForm.getByLabel("Descripción").fill("Descripción sintética vinculada a auditoría A.");
  await linkedForm.getByLabel("Área", { exact: true }).fill("Operaciones");
  await linkedForm.getByLabel("Responsable").selectOption("3");
  await linkedForm.getByLabel("Justificación de la evaluación").fill("Evaluación inicial de ejemplo.");
  await linkedForm.getByRole("button", { name: "Crear riesgo" }).click();
  await expect(page.getByText("Riesgo registrado.")).toBeVisible();
  expect(requests[1].linkedAuditId).toBe("AUD-100");
  expect(requests[1]).not.toHaveProperty("orgUnitId");
});

test("risk creation waits for the entity directory and offers a retry on error", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  let attempts = 0;
  await page.route("**/api/org-units/available", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { message: "Servicio de entidades no disponible." } })
      : route.fulfill({ json: { units: [] } });
  });
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: route.request().url().endsWith("/owners")
    ? { owners: [] } : { risks: [] } }));

  await page.goto("/riesgos");
  await page.getByRole("button", { name: "Registrar riesgo" }).click();
  const form = page.locator("form.risk-modal");
  await expect(form.getByText("No se pudieron consultar las entidades.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Crear riesgo" })).toBeDisabled();
  await form.getByRole("button", { name: "Reintentar" }).click();
  await expect(form.getByLabel("Ámbito empresarial")).toBeEnabled();
  await expect(form.getByRole("button", { name: "Crear riesgo" })).toBeEnabled();
});
