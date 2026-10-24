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
  await expect(page.getByRole("button", { name: "Administrar biblioteca" })).toHaveCount(0);
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

test("biblioteca: solo Super Admin publica categoría y revisión confirmada", async ({ page }) => {
  await useSession(page, "SUPER_ADMIN", 1);
  const categories = [{ id: "cat-a", code: "OPS", name: "Operación", description: "Ejemplo sintético", parentId: null }];
  const templates = [{ id: "tpl-a:1", templateId: "tpl-a", categoryId: "cat-a", title: "Interrupción del servicio",
    scenario: "El servicio de demostración podría quedar indisponible.", causes: ["Fallo de energía"],
    consequences: ["Demora en la operación"], sourceNote: "Ejemplo sintético", revision: 1,
    createdAt: "2026-10-24T00:00:00.000Z" }];
  await page.route("**/api/risk-library/", (route) => route.fulfill({ json: { categories, templates } }));
  await page.route("**/api/risk-library/categories", async (route) => {
    const body = route.request().postDataJSON();
    categories.push({ id: "cat-b", ...body });
    await route.fulfill({ status: 201, json: { category: categories.at(-1) } });
  });
  await page.route("**/api/risk-library/templates", async (route) => {
    const body = route.request().postDataJSON();
    const published = { id: "tpl-b:1", templateId: "tpl-b", ...body, revision: 1,
      createdAt: "2026-10-24T00:00:00.000Z" };
    templates.push(published);
    await route.fulfill({ status: 201, json: { template: published } });
  });
  await page.route("**/api/risk-library/templates/tpl-a/revisions", async (route) => {
    const body = route.request().postDataJSON();
    templates[0] = { ...templates[0], ...body, id: "tpl-a:2", revision: 2 };
    await route.fulfill({ status: 201, json: { template: templates[0] } });
  });
  await page.goto("/biblioteca-riesgos");
  await page.getByRole("button", { name: "Administrar biblioteca" }).click();
  await page.getByLabel("Código único").fill("FIN");
  await page.getByLabel("Nombre", { exact: true }).fill("Finanzas");
  await page.getByLabel("Descripción").fill("Categoría sintética para pruebas.");
  await page.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText("Categoría creada. Ya aparece en la biblioteca.")).toBeVisible();
  await expect(page.getByText("2 categorías")).toBeVisible();
  await page.getByRole("button", { name: "Nueva plantilla" }).click();
  await page.locator(".risk-library-admin-form select").first().selectOption("cat-b");
  await page.getByLabel("Título").fill("Evento de ejemplo");
  await page.getByLabel("Escenario").fill("Una situación sintética podría interrumpir la operación.");
  await page.getByLabel("Causas (una por línea, máximo 8)").fill("Dependencia externa");
  await page.getByLabel("Consecuencias (una por línea, máximo 8)").fill("Demora temporal");
  await page.getByRole("button", { name: "Publicar plantilla" }).click();
  await expect(page.getByText("Plantilla publicada como versión 1.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Evento de ejemplo/ })).toBeVisible();
  await page.getByRole("button", { name: "Nueva versión" }).click();
  await page.getByLabel("Plantilla a revisar").selectOption("tpl-a");
  await expect(page.getByRole("heading", { name: "Comparar con versión 1" })).toBeVisible();
  await page.getByLabel("Escenario").fill("El servicio de demostración podría quedar indisponible durante un turno completo.");
  await page.getByLabel("Motivo de revisión").fill("Se detalló la duración estimada del ejemplo.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Publicar nueva versión" }).click();
  await expect(page.getByText("Nueva versión publicada. La versión anterior permanece en el historial.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Interrupción del servicio/ })).toContainText("VERSIÓN 2");
});
