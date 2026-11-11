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

test("a module opens its own offline preparation with no implicit download", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 203, name: "Auditor", role: "AUDITOR" }));
  });
  let dashboardReads = 0;
  await page.route("**/api/dashboard", (route) => {
    dashboardReads += 1;
    return route.fulfill({ status: 200, json: dashboard });
  });
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, json: { actions: [] } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel guardado de prueba" })).toBeVisible();
  await page.getByRole("button", { name: "Preparar esta vista sin conexión" }).click();
  await expect(page).toHaveURL(/\/sin-conexion\?seccion=dashboard$/);
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para preparar el panel 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para preparar el panel 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await expect(page.getByRole("checkbox", { name: "Panel de Portafolio" })).toBeChecked();
  const beforeCapture = dashboardReads;
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Panel de Portafolio: guardado")).toBeVisible();
  expect(dashboardReads).toBe(beforeCapture + 1);
});

test("local search finds only saved records without requesting the network", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 204, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, json: dashboard }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, json: { actions: [] } }));
  await page.route("**/api/risks/", (route) => route.fulfill({ status: 200,
    json: { risks: [{ id: "RSK-1", title: "Conciliación del inventario", area: "Operaciones" }] } }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para búsqueda local 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para búsqueda local 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Riesgos", exact: true }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Riesgos: guardado (1 registros)")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("searchbox", { name: "Buscar registro" }).fill("conciliacion");
  await expect(page.getByText("Conciliación del inventario", { exact: true })).toBeVisible();
  await expect(page.getByText("1 coincidencia en copias locales.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir sección" })).toHaveCount(1);
});
