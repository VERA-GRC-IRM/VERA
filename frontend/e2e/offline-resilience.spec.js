import { test, expect } from "@playwright/test";

const phrase = "Frase local exclusiva de resiliencia 2026";

async function prepare(page, id) {
  await page.addInitScript((userId) => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: userId, name: "Auditor", role: "AUDITOR" }));
  }, id);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("/sin-conexion");
}

test("storage retention is opt-in and reports browser refusal or grant honestly", async ({ page }) => {
  await page.addInitScript(() => {
    let granted = false;
    Object.defineProperty(navigator, "storage", { configurable: true, value: {
      estimate: async () => ({ usage: 1048576, quota: 104857600 }),
      persisted: async () => granted,
      persist: async () => { granted = true; return true; }
    } });
  });
  await prepare(page, 700);
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  const status = page.getByText(/Uso estimado de este sitio: 1\.0 MiB/);
  await expect(status).toContainText("Conservación reforzada: no concedida");
  await page.getByRole("button", { name: "Solicitar conservación al navegador" }).click();
  await expect(status).toContainText("Conservación reforzada: concedida");
  await expect(page.getByText(/Borrar los datos del sitio seguirá eliminando la copia/)).toBeVisible();
});

test("clearing browser site data removes the local copy without claiming server persistence", async ({ page }) => {
  await prepare(page, 701);
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Panel de Portafolio" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Panel de Portafolio: guardado")).toBeVisible();
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("vera-offline-v1");
      request.onsuccess = resolve;
      request.onerror = reject;
      request.onblocked = () => reject(new Error("La base local quedó bloqueada."));
    });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await expect(page.getByText("Panel de Portafolio: guardado")).toHaveCount(0);
});

test("a stale second tab cannot overwrite a newer encrypted vault revision", async ({ page, context }) => {
  await prepare(page, 702);
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  const second = await context.newPage();
  await prepare(second, 702);
  await second.getByLabel("Frase local", { exact: true }).fill(phrase);
  await second.getByRole("button", { name: "Desbloquear" }).click();
  await page.getByLabel("Título").fill("Primera pestaña");
  await page.getByLabel("Nota", { exact: true }).fill("Texto guardado antes del cambio simultáneo.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.getByText("Primera pestaña")).toBeVisible();
  await second.getByLabel("Título").fill("Segunda pestaña");
  await second.getByLabel("Nota", { exact: true }).fill("Este texto no debe reemplazar la primera nota.");
  await second.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(second.getByRole("alert")).toContainText("cambió en otra pestaña");
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByText("Primera pestaña")).toBeVisible();
  await expect(page.getByText("Segunda pestaña")).toHaveCount(0);
  await second.close();
});
