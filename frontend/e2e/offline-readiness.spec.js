import { test, expect } from "@playwright/test";

test("readiness distinguishes saved sections, local notes and work awaiting server confirmation", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 601, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ actions: [{ id: "plan-1", title: "Plan de seguimiento", sourceType: "FINDING", storageVersion: 1 }] }) }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva de ensayo 2026");
  await page.getByLabel("Repetir frase local").fill("Frase exclusiva de ensayo 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  const status = page.getByRole("region", { name: "Estado de este dispositivo" });
  await expect(status).toContainText("0Secciones vigentes");
  await page.getByRole("checkbox", { name: "Planes de acción" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(status).toContainText("1Secciones vigentes");
  await page.getByLabel("Título").fill("Nota personal");
  await page.getByLabel("Nota", { exact: true }).fill("Recordatorio local sin envío al servidor.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(1);
  await expect(status).toContainText("0Trabajos pendientes de envío");
  await context.setOffline(true);
  await page.getByLabel("Tipo de borrador").selectOption("ACTION_PROGRESS");
  await page.getByLabel("Plan de acción guardado").selectOption("plan-1");
  await page.getByLabel("Avance (%)").fill("50");
  await page.getByLabel("Explicación").fill("Avance preparado mientras no había red.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(2);
  await expect(status).toContainText("1Trabajos pendientes de envío", { timeout: 15000 });
  await expect(status).toContainText("Sin red detectada");
  await page.getByRole("link", { name: "Ver trabajo local guardado" }).click();
  const filters = page.getByRole("group", { name: "Filtrar trabajo local" });
  await filters.getByRole("button", { name: "Para enviar (1)" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(1);
  await expect(page.getByText("Nota personal")).toHaveCount(0);
  await filters.getByRole("button", { name: "Revisar (0)" }).click();
  await expect(page.getByText("No hay trabajos en esta vista.", { exact: false })).toBeVisible();
  await filters.getByRole("button", { name: "Notas (1)" }).click();
  await expect(page.getByText("Nota personal")).toBeVisible();
  await filters.getByRole("button", { name: "Todos (2)" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(2);
});
