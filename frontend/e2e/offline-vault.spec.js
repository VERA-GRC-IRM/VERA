import { test, expect } from "@playwright/test";

const phrase = "Una frase privada para VERA 2026";

async function asUser(page, id) {
  await page.addInitScript((userId) => {
    if (!localStorage.getItem("token")) localStorage.setItem("token", "browser-test-token");
    if (!localStorage.getItem("user")) {
      localStorage.setItem("user", JSON.stringify({ id: userId, name: `Cuenta ${userId}`, role: "AUDITOR" }));
    }
  }, id);
}

test("local copy is encrypted, isolated by account, locked after reload, and removable", async ({ page, context }) => {
  await asUser(page, 101);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("/sin-conexion");
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByLabel("Repetir frase local").fill(phrase);
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await expect(page.getByRole("heading", { name: "Espacio desbloqueado" })).toBeVisible();

  const record = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("vera-offline-v1", 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("vaults").objectStore("vaults").getAll();
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = reject;
    };
    request.onerror = reject;
  }));
  expect(record).toHaveLength(1);
  expect(Object.keys(record[0]).sort()).toEqual(["ciphertext", "createdAt", "iv", "revision", "salt", "scope"]);
  expect(record[0].ciphertext).toBeInstanceOf(Object);
  expect(JSON.stringify(record)).not.toContain(phrase);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Desbloquear copia local" })).toBeVisible();
  await page.getByLabel("Frase local", { exact: true }).fill("frase incorrecta");
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByRole("alert")).toContainText("no coincide");
  await page.getByLabel("Frase local", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByRole("heading", { name: "Espacio desbloqueado" })).toBeVisible();

  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ id: 102, name: "Otra cuenta", role: "AUDITOR" })));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ id: 101, name: "Cuenta 101", role: "AUDITOR" })));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Desbloquear copia local" })).toBeVisible();
  await page.getByRole("button", { name: "Borrar copia de este dispositivo" }).click();
  await page.getByRole("button", { name: "Confirmar borrado de esta copia" }).click();
  await expect(page.getByRole("heading", { name: "Habilitar copia local" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "Crear espacio" })).toBeVisible();
});
