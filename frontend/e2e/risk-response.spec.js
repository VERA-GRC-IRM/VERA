import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("respuesta: registra una propuesta visible sin cambiar la evaluación", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const risk = { id: "RSK-TEST", title: "Exposición operativa", description: "Escenario sintético de operación.",
    area: "Operaciones", ownerId: 3, ownerName: "Gerencia", level: "Medio", score: 4,
    likelihood: 2, impact: 2, evaluations: [{ version: 1, level: "Medio", score: 4,
      note: "Valoración inicial de ejemplo", assessedAt: "2026-10-25T00:00:00Z" }], responseDecisions: [] };
  const received = [];
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { templates: [], categories: [] } }));
  await page.route("**/api/business-context", (route) => route.fulfill({ json: { records: [] } }));
  await page.route("**/api/risks/**", async (route) => {
    if (route.request().url().endsWith("/owners")) {
      return route.fulfill({ json: { owners: [{ id: 3, name: "Gerencia", role: "GERENTE" }] } });
    }
    if (route.request().url().endsWith("/response")) {
      const body = route.request().postDataJSON();
      received.push(body);
      risk.responseDecisions.push({ ...body, revision: 1, status: "PROPOSED", ownerName: "Gerencia",
        proposedBy: { name: "Gerencia" }, proposedAt: "2026-10-25T00:00:00Z" });
      return route.fulfill({ json: { risk } });
    }
    return route.fulfill({ json: { risks: [risk] } });
  });

  await page.goto("/riesgos");
  await page.getByRole("button", { name: "Definir estrategia" }).click();
  const form = page.locator("form.risk-modal");
  await form.getByLabel("Estrategia").selectOption("REDUCE");
  await form.getByLabel("Motivo").fill("La exposición requiere seguimiento y revisión explícita.");
  await form.getByLabel("Acciones o condiciones").fill("Revisar controles y documentar resultados de la acción.");
  await form.getByLabel("Fecha de revisión").fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Guardar propuesta" }).click();
  await expect(page.getByText("Estrategia propuesta y registrada en el historial.")).toBeVisible();
  await expect(page.getByText("Propuesta pendiente de decisión formal.", { exact: false })).toBeVisible();
  expect(received[0].expectedRevision).toBe(0);
  expect(received[0].strategy).toBe("REDUCE");
  await expect(page.getByText("P×I 4 / 9")).toBeVisible();
});
