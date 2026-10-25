import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("seguimiento: cuenta y filtra propuestas por fecha sin alterar el registro", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const base = { description: "Escenario sintético.", area: "Operaciones", ownerId: 3,
    ownerName: "Gerencia", level: "Medio", score: 4, likelihood: 2, impact: 2, evaluations: [] };
  const decision = (reviewDate) => ({ revision: 1, status: "PROPOSED", strategy: "REDUCE",
    ownerName: "Gerencia", actions: "Revisar el tratamiento y sus evidencias.",
    rationale: "El equipo necesita revisar la respuesta propuesta.", reviewDate,
    proposedBy: { name: "Gerencia" }, proposedAt: "2026-10-25T00:00:00Z" });
  const risks = [
    { ...base, id: "RSK-SIN", title: "Sin estrategia", responseDecisions: [] },
    { ...base, id: "RSK-VENCIDO", title: "Revisión vencida de ejemplo", responseDecisions: [decision("2000-01-01")] },
    { ...base, id: "RSK-FUTURO", title: "Revisión futura de ejemplo", responseDecisions: [decision("2999-01-01")] }
  ];
  const queries = [];
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { templates: [], categories: [] } }));
  await page.route("**/api/business-context", (route) => route.fulfill({ json: { records: [] } }));
  await page.route("**/api/risks/**", (route) => {
    if (route.request().url().endsWith("/owners")) return route.fulfill({ json: { owners: [] } });
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { risks } });
  });

  await page.goto("/riesgos");
  const overview = page.getByRole("region", { name: "Seguimiento de estrategias" });
  await expect(overview.getByRole("button", { name: /Sin propuesta 1/ })).toBeVisible();
  await expect(overview.getByRole("button", { name: /Revisión vencida 1/ })).toBeVisible();
  await expect(overview.getByRole("button", { name: /Revisión futura 1/ })).toBeVisible();

  await overview.getByRole("button", { name: /Revisión vencida 1/ }).click();
  await expect(page).toHaveURL(/response=OVERDUE/);
  await expect(page.getByRole("heading", { name: "Revisión vencida de ejemplo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sin estrategia" })).toHaveCount(0);
  await expect(page.getByText("Mostrando 1 de 3 riesgos visibles", { exact: false })).toBeVisible();
  expect(queries.every((params) => !params.has("response"))).toBe(true);

  await overview.getByRole("button", { name: /Revisión vencida 1/ }).click();
  await expect(page.getByRole("heading", { name: "Sin estrategia" })).toBeVisible();
});
