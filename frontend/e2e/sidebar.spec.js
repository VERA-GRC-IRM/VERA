import { test, expect } from "@playwright/test";
import { stubDashboard, useSession } from "./fixtures.js";

test("sidebar renders each permitted destination once without duplicate React keys", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  const duplicateKeyWarnings = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Encountered two children with the same key")) {
      duplicateKeyWarnings.push(message.text());
    }
  });

  await page.goto("/dashboard");
  const navigation = page.locator(".sidebar nav");
  await expect(navigation.getByRole("button", { name: "Panel de Portafolio", includeHidden: true })).toHaveCount(1);
  await expect(navigation.getByRole("button", { name: "Mapa de controles", includeHidden: true })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Asistente de IA", includeHidden: true })).toHaveCount(1);
  await expect(navigation.getByRole("button", { name: "Usuarios", includeHidden: true })).toHaveCount(1);
  expect(duplicateKeyWarnings).toEqual([]);
});

test("TC-08: el menú abre Planificación desde el panel", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.goto("/dashboard");
  const mobileMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("navigation", { name: "Módulos principales" })
    .getByRole("button", { name: "Planificación" }).click();
  await expect(page).toHaveURL(/\/planificacion$/);
  await expect(page.getByRole("heading", { name: "Planificación" })).toBeVisible();
});

test("TC-09: cerrar sesión borra la sesión local y protege la URL directa", async ({ page }) => {
  await stubDashboard(page, "DIRECTOR");
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("token", "e2e-fixture-token");
    localStorage.setItem("user", JSON.stringify({ id: 2, name: "Cuenta de prueba", role: "DIRECTOR" }));
  });
  await page.goto("/dashboard");
  const mobileMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => [localStorage.getItem("token"), localStorage.getItem("user")]))
    .toEqual([null, null]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);
});
