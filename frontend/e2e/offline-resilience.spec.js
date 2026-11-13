import { test, expect, devices } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

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

test("an encrypted backup restores only with the original phrase and never exposes draft text", async ({ page, context }) => {
  await prepare(page, 703);
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByLabel("Título").fill("Nota de recuperación");
  await page.getByLabel("Nota", { exact: true }).fill("Conservar el borrador durante un cambio de dispositivo.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar copia cifrada" }).click()
  ]);
  const buffer = await readFile(await download.path());
  const backup = JSON.parse(buffer.toString("utf8"));
  expect(backup.format).toBe("vera-offline-backup-v1");
  expect(buffer.toString("utf8")).not.toContain("Nota de recuperación");
  await page.getByRole("button", { name: "Borrar copia de este dispositivo" }).click();
  await page.getByRole("button", { name: "Confirmar borrado de esta copia" }).click();
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Archivo de copia").setInputFiles({ name: "otra-cuenta.json",
    mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...backup, scope: `${backup.scope}-other` })) });
  await page.getByLabel("Frase local original").fill(phrase);
  await page.getByRole("button", { name: "Restaurar copia" }).click();
  await expect(page.getByRole("alert")).toContainText("otra cuenta");
  await page.getByLabel("Archivo de copia").setInputFiles({ name: download.suggestedFilename(),
    mimeType: "application/json", buffer });
  await page.getByLabel("Frase local original").fill("Frase equivocada para recuperar");
  await page.getByRole("button", { name: "Restaurar copia" }).click();
  await expect(page.getByRole("alert")).toContainText("no coincide");
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await page.getByLabel("Frase local original").fill(phrase);
  await page.getByRole("button", { name: "Restaurar copia" }).click();
  await expect(page.getByText("Nota de recuperación")).toBeVisible();
  await expect(page.getByText(/Revisa la vigencia de cada sección/)).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByText("Nota de recuperación")).toBeVisible();
});

test("an encrypted backup can be restored in a separate mobile browser context while offline", async ({ page, browser, browserName }) => {
  await prepare(page, 704);
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByLabel("Título").fill("Nota portátil");
  await page.getByLabel("Nota", { exact: true }).fill("Este borrador debe seguir disponible sin red.");
  await page.getByRole("button", { name: "Guardar borrador local" }).click();
  await expect(page.getByText("Nota portátil")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar copia cifrada" }).click()
  ]);
  const buffer = await readFile(await download.path());

  const mobile = await browser.newContext({ ...devices["Pixel 7"], baseURL: new URL(page.url()).origin });
  try {
    const mobilePage = await mobile.newPage();
    await prepare(mobilePage, 704);
    await expect(mobilePage.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
    await mobilePage.evaluate(() => navigator.serviceWorker.ready);
    await mobilePage.reload();
    await mobilePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await mobile.setOffline(true);
    await mobilePage.getByLabel("Archivo de copia").setInputFiles({
      name: download.suggestedFilename(), mimeType: "application/json", buffer
    });
    await mobilePage.getByLabel("Frase local original").fill(phrase);
    await mobilePage.getByRole("button", { name: "Restaurar copia" }).click();
    await expect(mobilePage.getByText("Nota portátil")).toBeVisible();
    if (browserName === "firefox") {
      // Firefox's forced-offline mode rejects even service-worker-backed navigations.
      // Abort network requests instead, as in the existing draft reopening scenario.
      await mobile.setOffline(false);
      await mobilePage.route("**/*", (route) => route.abort("internetdisconnected"));
    }
    await mobilePage.reload();
    if (browserName === "firefox") {
      const apiStatus = await mobilePage.evaluate(() => fetch("/api/dashboard")
        .then((response) => response.status).catch(() => 0));
      expect(apiStatus).toBe(0);
    }
    await mobilePage.getByLabel("Frase local", { exact: true }).fill(phrase);
    await mobilePage.getByRole("button", { name: "Desbloquear" }).click();
    await expect(mobilePage.getByText("Nota portátil")).toBeVisible();
  } finally {
    await mobile.close();
  }
  await expect(page.getByText("Nota portátil")).toBeVisible();
});

test("a version 1 encrypted backup remains readable after a later application build", async ({ page, context, browserName }) => {
  const buffer = await readFile(new URL("./fixtures/offline-vault-v1.json", import.meta.url));
  expect(buffer.toString("utf8")).not.toContain("Nota histórica sintética");
  await prepare(page, 706);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.getByLabel("Archivo de copia").setInputFiles({
    name: "offline-vault-v1.json", mimeType: "application/json", buffer
  });
  await page.getByLabel("Frase local original").fill("Frase sintética para compatibilidad VERA 2026");
  await page.getByRole("button", { name: "Restaurar copia" }).click();
  await expect(page.getByText("Nota histórica sintética")).toBeVisible();
  if (browserName === "firefox") {
    // Firefox rejects even cached navigations under Playwright's forced-offline mode.
    await context.setOffline(false);
    await page.route("**/*", (route) => route.abort("internetdisconnected"));
  }
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill("Frase sintética para compatibilidad VERA 2026");
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByText("Nota histórica sintética")).toBeVisible();
});
