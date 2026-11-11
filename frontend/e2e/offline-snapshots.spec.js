import { test, expect } from "@playwright/test";

const dashboard = {
  role: "AUDITOR", scopeLabel: "Solo mis asignaciones", title: "Panel guardado de prueba",
  description: "Datos guardados con autorización", selectedPeriod: { period: "all" },
  permissions: { canCreate: false, canApprove: false },
  metrics: { total: 0, pending: 0, active: 0, highRisk: 0, openFindings: 0, averageProgress: 0 },
  statusCounts: [], riskMatrix: [], pendingItems: []
};

test("selected authorized data opens offline and an online denial is never replaced by a snapshot", async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("token")) localStorage.setItem("token", "browser-test-token");
    if (!localStorage.getItem("user")) localStorage.setItem("user", JSON.stringify({ id: 201, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard) }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ actions: [] }) }));
  await page.goto("/sin-conexion");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva de prueba 2026");
  await page.getByLabel("Repetir frase local").fill("Frase exclusiva de prueba 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Panel de Portafolio" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Resultado de la actualización")).toBeVisible();
  await expect(page.getByText("Panel de Portafolio: guardado")).toBeVisible();
  await page.getByRole("checkbox", { name: "Panel de Portafolio" }).uncheck();
  await page.getByRole("checkbox", { name: "Planes de acción" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Planes de acción: guardado (0 registros)")).toBeVisible();
  await expect(page.getByText(/Panel de Portafolio.*Guardado/)).toBeVisible();
  await page.unroute("**/api/dashboard");
  await page.unroute("**/api/actions");
  await context.setOffline(true);
  await page.getByRole("link", { name: "Abrir" }).first().click();
  await expect(page.getByRole("heading", { name: "Panel guardado de prueba" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Mostrando copia local" })).toBeVisible();

  await context.setOffline(false);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Sin permiso vigente"}' }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Sin permiso vigente");
  await expect(page.getByRole("heading", { name: "Panel guardado de prueba" })).not.toBeVisible();
});

test("preparation packs select sections without downloading or bypassing authorization", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 202, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, json: dashboard }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, json: { actions: [] } }));
  let restrictedReads = 0;
  for (const path of ["planning", "planning/active", "notifications"]) {
    await page.route(`**/api/${path}`, (route) => {
      restrictedReads += 1;
      return route.fulfill({ status: 403, json: { message: "Sin permiso" } });
    });
  }
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva para preparar 2026");
  await page.getByLabel("Repetir frase local").fill("Frase exclusiva para preparar 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("button", { name: "Portafolio y pendientes" }).click();
  await expect(page.getByRole("checkbox", { name: "Panel de Portafolio" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Pendientes" })).toBeChecked();
  await expect(page.getByText(/4 de \d+ secciones seleccionadas/)).toBeVisible();
  expect(restrictedReads).toBe(0);
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Panel de Portafolio: guardado")).toBeVisible();
  await expect(page.getByText("Planificación: Sin permiso")).toBeVisible();
  expect(restrictedReads).toBe(3);
  await page.getByRole("button", { name: "Limpiar selección" }).click();
  await expect(page.getByText(/0 de \d+ secciones seleccionadas/)).toBeVisible();
});
