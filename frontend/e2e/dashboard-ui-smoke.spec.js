import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubDashboard, useSession } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
});

test("panel de portafolio: navegación por teclado entre pestañas", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Secciones del panel" });
  const overview = tabs.getByRole("tab", { name: "Panorama" });
  const commitments = tabs.getByRole("tab", { name: "Mis compromisos" });
  const analysis = tabs.getByRole("tab", { name: "Estado y riesgo" });
  const priorities = tabs.getByRole("tab", { name: "Por atender" });

  await expect(overview).toHaveAttribute("aria-selected", "true");
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(commitments).toBeFocused();
  await expect(commitments).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "dashboard-tab-commitments");

  await page.keyboard.press("End");
  await expect(priorities).toBeFocused();
  await expect(priorities).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Actividades en seguimiento" })).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(analysis).toBeFocused();
  await expect(analysis).toHaveAttribute("aria-selected", "true");
});

test("panel de portafolio: no presenta infracciones WCAG 2.1 A/AA automatizadas", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();

  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(scan.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
  }))).toEqual([]);
});
