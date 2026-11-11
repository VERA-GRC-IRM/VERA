import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const dist = resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png" };

test("updating the installed service worker preserves a saved encrypted draft", async ({ browser }) => {
  const originalWorker = await readFile(join(dist, "sw.js"), "utf8");
  let workerVersion = 1;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/api/dashboard") {
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end("{}");
        return;
      }
      if (pathname.startsWith("/api/")) {
        response.writeHead(404, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      if (pathname === "/sw.js") {
        response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
        response.end(`${originalWorker}\n// Offline update rehearsal ${workerVersion}\n`);
        return;
      }
      const file = pathname === "/" || !extname(pathname) ? join(dist, "index.html")
        : resolve(dist, `.${pathname}`);
      if (file !== join(dist, "index.html") && !file.startsWith(`${dist}${sep}`)) {
        response.writeHead(400); response.end(); return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end();
    }
  });
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ baseURL: origin });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("token", "synthetic-browser-token");
      localStorage.setItem("user", JSON.stringify({ id: 707, name: "Auditor", role: "AUDITOR" }));
    });
    await page.goto("/sin-conexion");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.getByLabel("Frase local", { exact: true }).fill("Frase sintética para actualizar VERA 2026");
    await page.getByLabel("Repetir frase local").fill("Frase sintética para actualizar VERA 2026");
    await page.getByRole("button", { name: "Crear espacio" }).click();
    await page.getByLabel("Título").fill("Borrador anterior a la actualización");
    await page.getByLabel("Nota", { exact: true }).fill("Guardar el texto antes de instalar otra versión.");
    await page.getByRole("button", { name: "Guardar borrador local" }).click();
    await expect(page.getByText("Borrador anterior a la actualización")).toBeVisible();

    workerVersion = 2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.getByRole("status").filter({ hasText: "Hay una nueva versión de VERA" })).toBeVisible();
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Actualizar ahora" }).click()
    ]);
    await expect(page.getByRole("heading", { name: "Desbloquear copia local" })).toBeVisible();
    await context.setOffline(true);
    await page.getByLabel("Frase local", { exact: true }).fill("Frase sintética para actualizar VERA 2026");
    await page.getByRole("button", { name: "Desbloquear" }).click();
    await expect(page.getByText("Borrador anterior a la actualización")).toBeVisible();
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});
