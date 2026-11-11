import { test, expect } from "@playwright/test";

test("risk description draft stays local, requires explicit versioned send and compares conflicts", async ({ page, context }) => {
  const original = "Descripción original del riesgo operativo.";
  const revised = "Descripción revisada del riesgo operativo.";
  let current = { id: "RSK-501", title: "Riesgo operativo", description: original,
    updatedAt: null, storageVersion: 1 };
  let writes = 0;
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 503, name: "Gerente", role: "GERENTE" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/risks/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ risks: [current] }) }));
  await page.route("**/api/risks/RSK-501/offline-description", (route) => {
    writes += 1;
    const body = route.request().postDataJSON();
    expect(body.expected).toEqual({ storageVersion: 1, updatedAt: null, description: original });
    current = { ...current, description: body.description, storageVersion: 2, updatedAt: "2026-11-11T08:00:00.000Z" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ risk: current }) });
  });
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para edición controlada 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para edición controlada 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Riesgos" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await context.setOffline(true);
  await page.getByLabel("Registro guardado").selectOption("RSK-501");
  await page.getByLabel("Descripción revisada").fill(revised);
  await page.getByLabel("Motivo del cambio").fill("Se precisó el alcance en la visita de campo.");
  await page.getByRole("button", { name: "Guardar descripción local" }).click();
  await expect(page.getByText(revised)).toBeVisible();
  expect(writes).toBe(0);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Enviar descripción" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(writes).toBe(1);

  await context.setOffline(true);
  await page.getByLabel("Registro guardado").selectOption("RSK-501");
  await page.getByLabel("Descripción revisada").fill("Otra descripción propuesta para el riesgo.");
  await page.getByLabel("Motivo del cambio").fill("Se documentó un alcance posterior en campo.");
  await page.getByRole("button", { name: "Guardar descripción local" }).click();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Enviar descripción" }).click();
  await expect(page.getByRole("alert")).toContainText("cambió desde que preparaste");
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Comparar descripción actual" }).click();
  await expect(page.getByText("Registro actual en VERA")).toBeVisible();
  await expect(page.getByText(revised).last()).toBeVisible();
  await expect(page.getByText("Versión actual: 2")).toBeVisible();
});
