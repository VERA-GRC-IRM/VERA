import { test, expect } from "@playwright/test";

test("cleanup removes expired sections and confirmed work but preserves pending notes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T08:00:00.000Z") });
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 705, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ actions: [{ id: "plan-705", title: "Plan preparado", sourceType: "FINDING", storageVersion: 1 }] }) }));
  const content = "%PDF-1.4\nArchivo de limpieza\n";
  const path = "risk/risk-705/12345678-1234-1234-1234-123456789abc.pdf";
  await page.route("**/api/evidence/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ evidence: [{ id: "EVD-705", title: "Archivo preparado", entityType: "RISK",
      entityId: "risk-705", file: { path, mime: "application/pdf", size: content.length } }] }) }));
  await page.route("**/api/evidence/EVD-705/content", (route) => route.fulfill({ status: 200,
    contentType: "application/pdf", headers: { "X-VERA-Evidence-Path": path }, body: content }));
  await page.route("**/api/actions/plan-705", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ action: { id: "plan-705", storageVersion: 1 } }) }));
  await page.route("**/api/actions/plan-705/progress", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ action: { id: "plan-705", storageVersion: 2 } }) }));
  await page.goto("/sin-conexion");
  const phrase = "Frase de limpieza local controlada 2026";
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Planes de acción" }).check();
  await page.getByRole("checkbox", { name: "Evidencias (metadatos)" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByRole("region", { name: "Estado de este dispositivo" })).toContainText("2Secciones vigentes");
  await page.getByRole("button", { name: "Guardar archivo autorizado" }).click();
  await expect(page.getByText("1 de 2 archivos guardados")).toBeVisible();
  await page.getByLabel("Título").fill("Nota aún necesaria");
  await page.getByLabel("Nota", { exact: true }).fill("Conservar este trabajo local mientras se limpia el resto.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(1);
  await page.getByLabel("Tipo de borrador").selectOption("ACTION_PROGRESS");
  await page.getByLabel("Plan de acción guardado").selectOption("plan-705");
  await page.getByLabel("Avance (%)").fill("30");
  await page.getByLabel("Explicación").fill("Avance confirmado para la prueba de limpieza.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.locator(".offline-draft-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();

  await page.clock.fastForward(25 * 60 * 60 * 1000);
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Desbloquear" }).click();
  const status = page.getByRole("region", { name: "Estado de este dispositivo" });
  await expect(status).toContainText("2Copias caducadas");
  await page.getByRole("button", { name: "Limpiar datos finalizados" }).click();
  await expect(status).toContainText("Confirmar limpieza local");
  await expect(page.getByText("Nota aún necesaria")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar limpieza local" }).click();
  await expect(status).toContainText("0Copias caducadas");
  await expect(page.getByText("Nota aún necesaria")).toBeVisible();
  await expect(page.getByText("Enviado al servidor")).toHaveCount(0);
  await expect(page.getByText("Limpieza local terminada:")).toContainText("2 secciones caducadas, 1 borradores enviados y 1 archivos");
});
