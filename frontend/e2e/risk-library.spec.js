import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test("biblioteca: consulta, filtra y muestra versiones sin confundir plantilla con riesgo", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: {
    categories: [
      { id: "cat-a", code: "OPS", name: "Operación", description: "Ejemplos operativos", parentId: null },
      { id: "cat-b", code: "TECH", name: "Tecnología", description: "Ejemplos tecnológicos", parentId: "cat-a" }
    ],
    templates: [
      { id: "tpl-a:2", templateId: "tpl-a", categoryId: "cat-b", title: "Interrupción del servicio",
        scenario: "Un servicio de demostración puede quedar indisponible.", causes: ["Fallo de energía"],
        consequences: ["Retraso en la operación"], sourceNote: "Ejemplo sintético", revision: 2,
        createdAt: "2026-10-24T00:00:00.000Z" },
      { id: "tpl-b:1", templateId: "tpl-b", categoryId: "cat-a", title: "Error operativo",
        scenario: "Una acción manual podría ser omitida.", causes: ["Descuido humano"],
        consequences: ["Demora en el servicio"], sourceNote: null, revision: 1,
        createdAt: "2026-10-24T00:00:00.000Z" }
    ]
  } }));
  await page.route("**/api/risk-library/templates/tpl-a/revisions", (route) => route.fulfill({ json: { revisions: [
    { id: "tpl-a:1", revision: 1, revisionReason: "Versión inicial", createdAt: "2026-10-20T00:00:00.000Z" },
    { id: "tpl-a:2", revision: 2, revisionReason: "Se revisó el escenario", createdAt: "2026-10-24T00:00:00.000Z" }
  ] } }));
  await page.goto("/biblioteca-riesgos");
  await expect(page.getByRole("heading", { name: "Biblioteca de riesgos" })).toBeVisible();
  await expect(page.getByText("no es un riesgo registrado")).toBeVisible();
  await page.getByLabel("Familia de riesgos").selectOption("cat-b");
  await expect(page.getByRole("button", { name: /Interrupción del servicio/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Error operativo/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Interrupción del servicio/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fallo de energía")).toBeVisible();
  await expect(page.getByText("Ejemplo sintético")).toBeVisible();
  await expect(page.getByText("Se revisó el escenario")).toBeVisible();
  await page.getByLabel("Buscar plantilla").fill("sin coincidencias");
  await expect(page.getByText("Ninguna plantilla coincide con la búsqueda.")).toBeVisible();
});

test("biblioteca: informa cuando todavía no existe un catálogo publicado", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { categories: [], templates: [] } }));
  await page.goto("/biblioteca-riesgos");
  await expect(page.getByRole("heading", { name: "La biblioteca aún no tiene plantillas" })).toBeVisible();
});
