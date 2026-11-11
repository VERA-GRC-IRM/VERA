import { test, expect } from "@playwright/test";

async function prepareDraft(page, context, userId) {
  await page.addInitScript((id) => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id, name: "Auditor", role: "AUDITOR" }));
  }, userId);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ actions: [{ id: "plan-1", title: "Corregir control", sourceType: "FINDING", storageVersion: 3 }] }) }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase local para sincronizar 2026");
  await page.getByLabel("Repetir frase local").fill("Frase local para sincronizar 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Planes de acción" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Planes de acción: guardado (1 registros)")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Tipo de borrador").selectOption("ACTION_PROGRESS");
  await page.getByLabel("Plan de acción guardado").selectOption("plan-1");
  await page.getByLabel("Avance (%)").fill("75");
  await page.getByLabel("Explicación").fill("Se completó la revisión de evidencia y el plan continúa.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.getByText("Avance propuesto: 75%")).toBeVisible();
  await context.setOffline(false);
}

test("manual sync sends the original version once and confirms server acceptance", async ({ page, context }) => {
  await prepareDraft(page, context, 401);
  await page.route("**/api/actions/plan-1", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ action: { id: "plan-1", storageVersion: 3 } }) }));
  let writes = 0;
  await page.route("**/api/actions/plan-1/progress", (route) => {
    writes += 1;
    expect((route.request().headers())["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(route.request().postDataJSON()).toEqual({ version: 3, progressPercent: 75,
      note: "Se completó la revisión de evidencia y el plan continúa." });
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ action: { id: "plan-1", storageVersion: 4 } }) });
  });
  await page.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByRole("button", { name: "Enviar al servidor" })).toHaveCount(0);
});

test("changed server version blocks an offline draft before any write", async ({ page, context }) => {
  await prepareDraft(page, context, 402);
  await page.route("**/api/actions/plan-1", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ action: { id: "plan-1", storageVersion: 4 } }) }));
  let writes = 0;
  await page.route("**/api/actions/plan-1/progress", (route) => { writes += 1; return route.abort(); });
  await page.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(page.getByText("Conflicto de versión")).toBeVisible();
  expect(writes).toBe(0);
});

test("uncertain network result requires review and never retries automatically", async ({ page, context }) => {
  await prepareDraft(page, context, 403);
  await page.route("**/api/actions/plan-1", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ action: { id: "plan-1", storageVersion: 3 } }) }));
  let writes = 0;
  await page.route("**/api/actions/plan-1/progress", (route) => { writes += 1; return route.abort("failed"); });
  await page.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(page.getByText("Confirmación pendiente")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar al servidor" })).toHaveCount(0);
  expect(writes).toBe(1);
});

test("an explicit retry of uncertain progress uses the same operation without preflight version rejection", async ({ page, context }) => {
  await prepareDraft(page, context, 404);
  let latestVersion = 3;
  await page.route("**/api/actions/plan-1", (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ action: { id: "plan-1", storageVersion: latestVersion } }) }));
  const keys = [];
  await page.route("**/api/actions/plan-1/progress", async (route) => {
    keys.push((await route.request().allHeaders())["idempotency-key"]);
    if (keys.length === 1) { latestVersion = 4; return route.abort("failed"); }
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ action: { id: "plan-1", storageVersion: 4 } }) });
  });
  await page.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(page.getByText("Confirmación pendiente")).toBeVisible();
  await page.getByRole("button", { name: "Comprobar o reintentar plan" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
});
