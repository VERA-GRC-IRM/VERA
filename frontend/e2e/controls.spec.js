import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("HU-15: distingue vínculos, valoraciones preliminares y conserva el historial", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [{
    id: "RSK-15", title: "Conciliación", area: "Finanzas", level: "Medio"
  }] } }));
  await page.route("**/api/controls/**", (route) => route.fulfill({ json: { controls: [{
    id: "CTL-15", title: "Revisión mensual", description: "Control de conciliación mensual.",
    type: "DETECTIVE", frequency: "Monthly", ownerName: "Auditoría", ownerId: 5,
    riskIds: ["RSK-15"], effectiveness: 2, effectivenessResult: "INEFFECTIVE",
    evaluations: [
      { version: 1, rating: 4, result: "EFFECTIVE", note: "La muestra inicial no tenía diferencias.", assessedBy: { username: "qa" }, assessedAt: "2026-10-01T00:00:00Z" },
      { version: 2, rating: 2, result: "INEFFECTIVE", note: "La muestra nueva presenta excepciones.", assessedBy: { username: "qa" }, assessedAt: "2026-10-16T00:00:00Z" }
    ]
  }] } }));
  await page.route("**/api/findings/**", (route) => route.fulfill({ json: { findings: [] } }));
  await page.route("**/api/actions", (route) => route.fulfill({ json: { actions: [] } }));

  await page.goto("/controles");
  await expect(page.getByText("Riesgos con vínculo")).toBeVisible();
  await expect(page.getByText("Efectividad promedio")).toHaveCount(0);
  await expect(page.getByText("Un vínculo y una calificación preliminar no demuestran", { exact: false })).toBeVisible();
  const card = page.locator(".control-card").filter({ hasText: "Revisión mensual" });
  await expect(card).toContainText("Débil · 2/5");
  await card.locator("summary").click();
  await expect(card).toContainText("Versión 1 · calificación 4/5");
  await expect(card).toContainText("Versión 2 · calificación 2/5");
});
