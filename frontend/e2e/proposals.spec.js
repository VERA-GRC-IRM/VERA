import { test, expect } from "@playwright/test";
import { useSession } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [] } }));
});

test("HU-22: proposal captures scope, justification and an estimated period", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const proposals = [];
  let submitted;

  await page.route("**/api/planning/auditors", (route) => route.fulfill({ json: { auditors: [] } }));
  await page.route("**/api/planning", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      const proposal = { ...submitted, id: "AUD-550", status: "OPEN", risk: "Medio", approval: 0 };
      proposals.push(proposal);
      return route.fulfill({ status: 201, json: { proposal } });
    }
    return route.fulfill({ json: { proposals } });
  });

  await page.goto("/planificacion");
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  const form = page.locator("form.proposal-modal");
  await form.getByRole("textbox", { name: "Título de la propuesta" }).fill("Auditoría de compras");
  await form.getByRole("textbox", { name: "Unidad o área" }).fill("Compras");
  await form.getByRole("textbox", { name: "Objetivo" }).fill("Verificar autorizaciones");
  await form.getByRole("textbox", { name: "Alcance" }).fill("Órdenes y pagos del trimestre");
  await form.getByRole("textbox", { name: "Justificación" }).fill("Hallazgos de la revisión anterior");
  await form.getByLabel("Trimestre estimado").selectOption("Q2");
  await form.getByRole("button", { name: "Abrir propuesta" }).click();

  await expect(page.getByText("La propuesta fue creada y quedó abierta para revisión.")).toBeVisible();
  await page.getByRole("button", { name: "Ver detalles de AUD-550 Auditoría de compras" }).click();
  const details = page.getByRole("dialog", { name: "AUD-550 · Auditoría de compras" });
  await expect(details.getByText("Órdenes y pagos del trimestre")).toBeVisible();
  await expect(details.getByText("Hallazgos de la revisión anterior")).toBeVisible();
  expect(submitted).toMatchObject({
    objective: "Verificar autorizaciones",
    scope: "Órdenes y pagos del trimestre",
    justification: "Hallazgos de la revisión anterior",
    quarter: "Q2"
  });
});

test("HU-11: jefatura can propose and edit only its own open proposal", async ({ page }) => {
  await useSession(page, "JEFATURA", 4);
  const proposals = [{
    id: "AUD-OTHER", title: "Propuesta de gerencia", objective: "Revisar controles", area: "Operaciones",
    status: "OPEN", risk: "Medio", approval: 0, createdBy: { id: 3, name: "Gerencia" }
  }];
  await page.route("**/api/planning/auditors", (route) => route.fulfill({ json: { auditors: [] } }));
  await page.route("**/api/planning", (route) => {
    if (route.request().method() === "POST") {
      const proposal = {
        ...route.request().postDataJSON(), id: "AUD-OWN", status: "OPEN", risk: "Medio", approval: 0,
        createdBy: { id: 4, name: "Jefatura" }
      };
      proposals.push(proposal);
      return route.fulfill({ status: 201, json: { proposal } });
    }
    return route.fulfill({ json: { proposals } });
  });

  await page.goto("/planificacion");
  await expect(page.getByRole("button", { name: "Nueva propuesta" })).toBeVisible();
  const other = page.locator(".planning-card").filter({ hasText: "Propuesta de gerencia" });
  await other.getByRole("button", { name: "Abrir acciones de Propuesta de gerencia" }).click();
  const actions = page.getByRole("dialog", { name: "AUD-OTHER · Propuesta de gerencia" });
  await expect(actions.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Marcar 100% aprobada" })).toHaveCount(0);
  await actions.getByRole("button", { name: "Cerrar acciones" }).click();

  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  const form = page.locator("form.proposal-modal");
  await form.getByRole("textbox", { name: "Título de la propuesta" }).fill("Auditoría de inventarios");
  await form.getByRole("textbox", { name: "Unidad o área" }).fill("Logística");
  await form.getByRole("textbox", { name: "Objetivo" }).fill("Verificar inventarios");
  await form.getByRole("textbox", { name: "Alcance" }).fill("Almacenes regionales");
  await form.getByRole("textbox", { name: "Justificación" }).fill("Diferencias en conciliaciones");
  await form.getByLabel("Trimestre estimado").selectOption("Q2");
  await form.getByRole("button", { name: "Abrir propuesta" }).click();

  const own = page.locator(".planning-card").filter({ hasText: "Auditoría de inventarios" });
  await own.getByRole("button", { name: "Abrir acciones de Auditoría de inventarios" }).click();
  const ownActions = page.getByRole("dialog", { name: "AUD-OWN · Auditoría de inventarios" });
  await expect(ownActions.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect(ownActions.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
});

test("planning lets a manager select only an authorized entity for a new proposal", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  const firstId = "ORG-11111111-1111-4111-8111-111111111111";
  const secondId = "ORG-22222222-2222-4222-8222-222222222222";
  await page.route("**/api/org-units/available", (route) => route.fulfill({ json: { units: [
    { id: firstId, code: "LE_A", name: "Entidad A", accessLevel: "MANAGE" },
    { id: secondId, code: "LE_B", name: "Entidad B", accessLevel: "VIEW" }
  ] } }));
  await page.route("**/api/planning/auditors", (route) => route.fulfill({ json: { auditors: [] } }));
  let submitted;
  await page.route("**/api/planning", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { proposal: { ...submitted, id: "AUD-700", status: "OPEN" } } });
    }
    return route.fulfill({ json: { proposals: [] } });
  });

  await page.goto("/planificacion");
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  const form = page.locator("form.proposal-modal");
  const scope = form.getByLabel("Ámbito empresarial");
  await expect(scope).toBeEnabled();
  await expect(scope.locator("option")).toHaveCount(2);
  await scope.selectOption(firstId);
  await form.getByRole("textbox", { name: "Título de la propuesta" }).fill("Auditoría de entidad A");
  await form.getByRole("textbox", { name: "Unidad o área" }).fill("Operaciones");
  await form.getByRole("textbox", { name: "Objetivo" }).fill("Revisar control interno");
  await form.getByRole("textbox", { name: "Alcance" }).fill("Procesos del trimestre");
  await form.getByRole("textbox", { name: "Justificación" }).fill("Ejercicio de revisión sintética");
  await form.getByLabel("Trimestre estimado").selectOption("Q2");
  await form.getByRole("button", { name: "Abrir propuesta" }).click();
  await expect(page.getByText("La propuesta fue creada y quedó abierta para revisión.")).toBeVisible();
  expect(submitted.orgUnitId).toBe(firstId);
});
