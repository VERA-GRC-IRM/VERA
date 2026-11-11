import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";

test("evidence stays local while offline and uploads only after explicit confirmation", async ({ page, context }) => {
  const content = "%PDF-1.4\nOffline evidence fixture\n";
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 501, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/risks/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ risks: [{ id: "risk-1", title: "Riesgo operativo" }] }) }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para evidencias sin red 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para evidencias sin red 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Riesgos" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Riesgos: guardado (1 registros)")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Nombre de evidencia").fill("Informe de verificación");
  await page.getByLabel("Descripción de evidencia").fill("Archivo de prueba para riesgo operativo.");
  await page.getByLabel("Expediente guardado").selectOption("0");
  await page.getByLabel("Archivo (hasta 3 MiB)").setInputFiles({ name: "informe.pdf", mimeType: "application/pdf", buffer: Buffer.from(content) });
  await page.getByRole("button", { name: "Guardar archivo local" }).click();
  await expect(page.getByText(/informe\.pdf/)).toBeVisible();
  await expect(page.getByText("Pendiente de usar")).toBeVisible();
  const record = await page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open("vera-offline-v1", 1);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("vaults").objectStore("vaults").getAll();
      read.onsuccess = () => { resolve(read.result[0]); db.close(); };
      read.onerror = reject;
    };
    open.onerror = reject;
  }));
  expect(JSON.stringify(record)).not.toContain("Offline evidence fixture");

  await context.setOffline(false);
  let uploads = 0;
  await page.route("**/api/evidence/upload?**", (route) => {
    uploads += 1;
    expect(route.request().postData()).toBe(content);
    expect(route.request().headers()["content-type"]).toBe("application/pdf");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ evidence: { id: "evidence-1" } }) });
  });
  await page.getByRole("button", { name: "Cargar evidencia" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(uploads).toBe(1);
  await expect(page.getByRole("button", { name: "Cargar evidencia" })).toHaveCount(0);
});

test("authorized evidence can be encrypted locally, opened offline and removed on revocation", async ({ page, context }) => {
  const content = "%PDF-1.4\nPrivate offline example\n";
  const file = { path: "risk/risk-1/12345678-1234-1234-1234-123456789abc.pdf",
    bucket: "vera-evidence", mime: "application/pdf", size: Buffer.byteLength(content) };
  const item = { id: "EVD-501", title: "Soporte autorizado", entityType: "RISK", entityId: "risk-1", file };
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 502, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/evidence/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ evidence: [item] }) }));
  let denied = false;
  await page.route("**/api/evidence/EVD-501/content", (route) => denied
    ? route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    : route.fulfill({ status: 200, contentType: "application/pdf",
      headers: { "X-VERA-Evidence-Path": file.path }, body: content }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para lectura privada 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para lectura privada 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Evidencias (metadatos)" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Evidencias (metadatos): guardado (1 registros)")).toBeVisible();
  await page.getByRole("button", { name: "Guardar archivo autorizado" }).click();
  await expect(page.getByText("1 de 2 archivos guardados")).toBeVisible();
  const record = await page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open("vera-offline-v1", 1);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("vaults").objectStore("vaults").getAll();
      read.onsuccess = () => { resolve(read.result[0]); db.close(); };
      read.onerror = reject;
    };
    open.onerror = reject;
  }));
  expect(JSON.stringify(record)).not.toContain("Private offline example");

  await context.setOffline(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia local" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("evidencia-EVD-501.pdf");
  expect((await import("node:fs")).readFileSync(await download.path(), "utf8")).toBe(content);
  await context.setOffline(false);

  denied = true;
  await page.getByRole("button", { name: "Quitar archivo" }).click();
  await page.getByRole("button", { name: "Guardar archivo autorizado" }).click();
  await expect(page.getByRole("alert")).toContainText("Ya no tienes acceso");
  await expect(page.getByText("Soporte autorizado")).toHaveCount(0);
  await expect(page.getByText("0 de 2 archivos guardados")).toBeVisible();
});
