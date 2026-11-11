import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import process from "node:process";

const baselineDist = process.env.VERA_OFFLINE_BASELINE_DIST;
const targetDist = resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png" };

test("a real application release replaces the installed PWA without losing an encrypted draft", async ({ browser }) => {
  if (!baselineDist) throw new Error("Set VERA_OFFLINE_BASELINE_DIST to a separately built prior release.");
  const oldDist = resolve(baselineDist);
  const scriptName = async (directory) => {
    const html = await readFile(join(directory, "index.html"), "utf8");
    return html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
  };
  const oldScript = await scriptName(oldDist);
  const newScript = await scriptName(targetDist);
  expect(oldScript).toBeTruthy();
  expect(newScript).toBeTruthy();
  expect(newScript, "The two releases must contain distinct application bundles.").not.toBe(oldScript);

  let activeDist = oldDist;
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
      const file = pathname === "/" || !extname(pathname) ? join(activeDist, "index.html")
        : resolve(activeDist, `.${pathname}`);
      if (file !== join(activeDist, "index.html") && !file.startsWith(`${activeDist}${sep}`)) {
        response.writeHead(400); response.end(); return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store" });
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
    await expect(page.locator('script[type="module"]')).toHaveAttribute("src", oldScript);
    await page.getByLabel("Frase local", { exact: true }).fill("Frase sintética para dos releases VERA 2026");
    await page.getByLabel("Repetir frase local").fill("Frase sintética para dos releases VERA 2026");
    await page.getByRole("button", { name: "Crear espacio" }).click();
    await page.getByLabel("Título").fill("Nota creada en la versión anterior");
    await page.getByLabel("Nota", { exact: true }).fill("Debe seguir disponible tras instalar la versión nueva.");
    await page.getByRole("button", { name: "Guardar borrador local" }).click();
    await expect(page.getByText("Nota creada en la versión anterior")).toBeVisible();

    activeDist = targetDist;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.getByRole("status").filter({ hasText: "Hay una nueva versión de VERA" })).toBeVisible();
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Actualizar ahora" }).click()]);
    await expect(page.locator('script[type="module"]')).toHaveAttribute("src", newScript);
    await expect(page.getByRole("heading", { name: "Desbloquear copia local" })).toBeVisible();
    await context.setOffline(true);
    await page.getByLabel("Frase local", { exact: true }).fill("Frase sintética para dos releases VERA 2026");
    await page.getByRole("button", { name: "Desbloquear" }).click();
    await expect(page.getByText("Nota creada en la versión anterior")).toBeVisible();
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});
