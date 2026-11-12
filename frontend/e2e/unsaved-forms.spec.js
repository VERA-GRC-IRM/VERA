import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("los cambios de una estrategia no se pierden al cerrar o cambiar de vista", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const risk = { id: "RSK-TEST", title: "Exposición operativa", description: "Escenario sintético de operación.",
    area: "Operaciones", ownerId: 3, ownerName: "Gerencia", level: "Medio", score: 4,
    likelihood: 2, impact: 2, evaluations: [], responseDecisions: [] };
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { templates: [], categories: [] } }));
  await page.route("**/api/business-context", (route) => route.fulfill({ json: { records: [] } }));
  await page.route("**/api/risks/**", (route) => route.request().url().endsWith("/owners")
    ? route.fulfill({ json: { owners: [{ id: 3, name: "Gerencia", role: "GERENTE" }] } })
    : route.fulfill({ json: { risks: [risk] } }));

  await page.goto("/riesgos");
  await page.getByRole("button", { name: "Definir estrategia" }).click();
  const form = page.locator("form.risk-modal");
  await form.getByLabel("Motivo").fill("La exposición requiere una revisión documentada.");

  page.once("dialog", (dialog) => dialog.dismiss());
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Motivo")).toHaveValue("La exposición requiere una revisión documentada.");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("navigation", { name: "Módulos principales" })
    .getByRole("button", { name: "Panel de Portafolio" }).click();
  await expect(page).toHaveURL(/\/riesgos$/);
  await expect(form).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form).toHaveCount(0);
});

test("una propuesta iniciada conserva el texto si se cancela el cierre", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/planning/auditors", (route) => route.fulfill({ json: { auditors: [] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.goto("/planificacion");
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  const form = page.locator("form.proposal-modal");
  await form.getByRole("textbox", { name: "Título de la propuesta" }).fill("Auditoría de compras");

  page.once("dialog", (dialog) => dialog.dismiss());
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form.getByRole("textbox", { name: "Título de la propuesta" })).toHaveValue("Auditoría de compras");

  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form).toHaveCount(0);
});
