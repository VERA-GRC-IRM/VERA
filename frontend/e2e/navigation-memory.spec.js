import { test, expect } from "@playwright/test";
import { stubDashboard, useSession } from "./fixtures.js";

test.use({ viewport: { width: 1280, height: 500 } });

test("volver al panel conserva la posición de lectura", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/business-context", (route) => route.fulfill({ json: { records: [] } }));

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Consulta del portafolio" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const prior = await page.evaluate(() => window.scrollY);

  await page.getByRole("navigation", { name: "Módulos principales" })
    .getByRole("button", { name: "Planificación" }).click();
  await expect(page).toHaveURL(/\/planificacion$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Consulta del portafolio" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
    .toBeGreaterThanOrEqual(prior - 100);
});

test("volver al registro conserva el filtro escrito en la URL", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await stubDashboard(page, "GERENTE");
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { templates: [], categories: [] } }));
  await page.route("**/api/business-context", (route) => route.fulfill({ json: { records: [] } }));
  await page.route("**/api/risks/**", (route) => route.request().url().endsWith("/owners")
    ? route.fulfill({ json: { owners: [] } }) : route.fulfill({ json: { risks: [] } }));

  await page.goto("/riesgos");
  await page.getByRole("textbox", { name: "Buscar" }).fill("Compras");
  await expect(page).toHaveURL(/\/riesgos\?search=Compras$/);
  await page.getByRole("navigation", { name: "Módulos principales" })
    .getByRole("button", { name: "Panel de Portafolio" }).click();
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Buscar" })).toHaveValue("Compras");
});
