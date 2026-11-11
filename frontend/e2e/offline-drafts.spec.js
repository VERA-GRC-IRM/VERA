import { test, expect } from "@playwright/test";

test("a draft remains encrypted and available after reopening without claiming server persistence", async ({ page, context, browserName }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("token")) localStorage.setItem("token", "browser-test-token");
    if (!localStorage.getItem("user")) localStorage.setItem("user", JSON.stringify({ id: 301, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("/sin-conexion");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva para borradores 2026");
  await page.getByLabel("Repetir frase local").fill("Frase exclusiva para borradores 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await context.setOffline(true);
  await page.getByLabel("Título").fill("Nota de riesgo operativo");
  await page.getByLabel("Nota", { exact: true }).fill("Revisar el control antes de registrar el hallazgo.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.getByText("Revisar el control antes de registrar el hallazgo.")).toBeVisible();
  const revision = await page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open("vera-offline-v1", 1);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("vaults").objectStore("vaults").getAll();
      read.onsuccess = () => { resolve(read.result[0]?.revision); db.close(); };
      read.onerror = reject;
    };
    open.onerror = reject;
  }));
  expect(revision).toBe(2);
  if (browserName === "firefox") {
    // Firefox's force-offline emulation rejects even cached navigations; abort
    // network requests instead to verify the installed service worker path.
    await context.setOffline(false);
    await page.route("**/*", (route) => route.abort("internetdisconnected"));
  }
  await page.reload();
  if (browserName === "firefox") {
    const apiStatus = await page.evaluate(() => fetch("/api/dashboard")
      .then((response) => response.status).catch(() => 0));
    expect(apiStatus).toBe(0);
  }
  await expect(page.getByRole("heading", { name: "Desbloquear copia local" })).toBeVisible();
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva para borradores 2026");
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByText("Revisar el control antes de registrar el hallazgo.")).toBeVisible();
  await page.getByRole("button", { name: "Borrar borrador" }).click();
  await page.getByRole("button", { name: "Confirmar borrado" }).click();
  await expect(page.getByText("Revisar el control antes de registrar el hallazgo.")).not.toBeVisible();
});

test("a finding action draft records a proposal while offline", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 302, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/actions", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ actions: [{ id: "plan-1", title: "Corregir control", sourceType: "FINDING", storageVersion: 3 }] }) }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para planes de acción 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para planes de acción 2026");
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
  await expect(page.getByText("Pendiente de usar")).toBeVisible();
});
