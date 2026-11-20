import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dashboardSummary, stubDashboard, useSession } from "./fixtures.js";

test("period controls refresh dashboard scope without changing personal commitments", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  const queries = [];
  await page.route(/\/api\/dashboard(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    const summary = dashboardSummary("DIRECTOR");
    if (url.searchParams.get("period") === "quarter") summary.metrics.total = 1;
    return route.fulfill({ json: summary });
  });
  await page.route("**/api/actions", (route) => route.fulfill({ json: { actions: [] } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();

  const periodGroup = page.getByRole("group", { name: "Periodo de indicadores" });
  await periodGroup.getByLabel("Periodo").selectOption("quarter");
  await periodGroup.getByLabel("Trimestre").selectOption("Q3");
  await expect.poll(() => queries.some((query) => query.includes("period=quarter") && query.includes("quarter=Q3"))).toBe(true);

  await page.getByRole("tab", { name: "Mis compromisos" }).click();
  await expect(page.getByText("No tienes compromisos abiertos asignados en este momento.")).toBeVisible();
  await page.getByRole("tab", { name: "Panorama" }).click();
  await periodGroup.getByLabel("Periodo").selectOption("all");
  await expect.poll(() => queries.at(-1)).toBe("");
});

test("director sees portfolio indicators and analysis without decision shortcuts", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();
  for (const label of ["PROPUESTAS ABIERTAS", "AUDITORÍAS EN CURSO", "RIESGO ALTO", "HALLAZGOS ABIERTOS"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("tablist", { name: "Secciones del panel" }).getByRole("tab")).toHaveCount(4);
  await page.getByRole("tab", { name: "Estado y riesgo" }).click();
  await expect(page.getByRole("heading", { name: "Registros por estado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matriz de riesgo (P × I)" })).toBeVisible();
  await expect(page.locator(".dashboard-risk-cell")).toHaveCount(9);
  await expect(page.getByRole("navigation", { name: "Acciones rápidas" })).toHaveCount(0);
});

test("manager sees proposals that need a decision", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await stubDashboard(page, "GERENTE");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();
  await expect(page.getByText("PENDIENTES DE DECISIÓN", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Por atender" }).click();
  await expect(page.getByRole("heading", { name: "Propuestas pendientes de decisión" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver tablero" })).toHaveAttribute("href", "/planificacion");
  await expect(page.getByRole("heading", { name: "Auditoría de prueba" })).toBeVisible();
});

test("auditor sees assigned work and does not see planning navigation", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await stubDashboard(page, "AUDITOR");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Módulos principales" })
    .getByRole("button", { name: "Planificación" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Por atender" }).click();
  await expect(page.getByRole("heading", { name: "Mis auditorías por atender" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir Auditoría de prueba" })).toHaveAttribute("href", "/auditorias-activas");
});

test("dashboard has no horizontal overflow on mobile and tablet viewports", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows, `horizontal overflow at ${viewport.width}px`).toBe(false);
  }
});

test("dashboard has no automated WCAG 2.1 A/AA violations", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Panel de Portafolio" })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
  }))).toEqual([]);
});
