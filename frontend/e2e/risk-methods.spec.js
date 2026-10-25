import { test, expect } from "@playwright/test";
import { stubDashboard, useSession } from "./fixtures.js";

test("métodos: Super Admin guarda borradores, revisa el historial y simula sin aprobar", async ({ page }) => {
  await useSession(page, "SUPER_ADMIN", 1);
  const revisions = [];
  await page.route("**/api/risks/methods/drafts", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { methods: revisions.length ? [revisions.at(-1)] : [] } });
    }
    const body = route.request().postDataJSON();
    const record = { ...body, id: "RISK-METHOD-TEST:1", methodId: "RISK-METHOD-TEST", revision: 1,
      revisionReason: "Borrador inicial", status: "DRAFT", approvedEnterprisePolicy: false,
      availableForAssessment: false, createdAt: "2026-10-25T00:00:00Z", createdBy: { username: "qa" } };
    revisions.push(record);
    return route.fulfill({ status: 201, json: { method: record } });
  });
  await page.route("**/api/risks/methods/drafts/RISK-METHOD-TEST/revisions", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { revisions } });
    const body = route.request().postDataJSON();
    const record = { ...body, id: "RISK-METHOD-TEST:2", methodId: "RISK-METHOD-TEST", revision: 2,
      status: "DRAFT", approvedEnterprisePolicy: false, availableForAssessment: false,
      createdAt: "2026-10-25T01:00:00Z", createdBy: { username: "qa" } };
    revisions.push(record);
    return route.fulfill({ status: 201, json: { method: record } });
  });
  await page.route("**/api/risks/methods/preview", (route) => route.fulfill({ json: { preview: {
    level: "Bajo", likelihood: "Rara", impact: "Menor", approvedEnterprisePolicy: false, persisted: false
  } } }));

  await page.goto("/metodos-riesgo");
  await expect(page.getByRole("heading", { name: "Métodos de evaluación" })).toBeVisible();
  await expect(page.getByText("Ninguno sustituye la matriz histórica")).toBeVisible();
  await page.getByLabel("Nombre del método").fill("Matriz sintética de ejemplo");
  await page.getByLabel("Identificador de versión").fill("draft-1");
  await page.getByLabel("Probabilidad, de menor a mayor").fill("Rara\nFrecuente");
  await page.getByLabel("Impacto, de menor a mayor").fill("Menor\nGrave");
  await page.getByLabel("Niveles, de menor a mayor").fill("Bajo\nAlto");
  await page.getByLabel("Rara y Menor").selectOption("Bajo");
  await page.getByLabel("Rara y Grave").selectOption("Alto");
  await page.getByLabel("Frecuente y Menor").selectOption("Alto");
  await page.getByLabel("Frecuente y Grave").selectOption("Alto");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador v1 guardado")).toBeVisible();
  await expect(page.getByText("Borrador inicial")).toBeVisible();
  await page.getByLabel("Identificador de versión").fill("draft-2");
  await page.getByLabel("Motivo de la nueva revisión").fill("Se aclara el alcance del ejemplo sintético.");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador v2 guardado")).toBeVisible();
  await expect(page.getByText("Revisión 1 · draft-1")).toBeVisible();
  await expect(page.getByText("Revisión 2 · draft-2")).toBeVisible();
  await page.getByLabel("Supuestos").fill("Supuesto sintético para simulación.");
  await page.getByRole("button", { name: "Calcular vista previa" }).click();
  await expect(page.getByText(/Resultado: Bajo/)).toBeVisible();
  await expect(page.getByText(/No aprobado ni persistido/)).toBeVisible();
});

test("métodos: una cuenta Auditor no ve el editor privado", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await stubDashboard(page, "AUDITOR");
  await page.goto("/metodos-riesgo");
  await expect(page.getByRole("heading", { name: "Métodos de evaluación" })).toHaveCount(0);
});
