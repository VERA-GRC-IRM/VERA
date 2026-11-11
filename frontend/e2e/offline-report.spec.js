import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const rows = [
  { audit: { id: "AUD-1", title: "=SUM(1,1)", status: "ACTIVE", orgUnitId: "UNIT-A",
    year: 2026, quarter: "Q1", responsible: "Ana", plannedHours: 10, executedHours: 4 },
  risks: [{ id: "R-1", title: "Riesgo" }], controls: [], findings: [], evidence: [] },
  { audit: { id: "AUD-2", title: "Auditoría posterior", status: "CLOSED", orgUnitId: "UNIT-B",
    year: 2027, quarter: "Q2", responsible: "Luis", plannedHours: 5, executedHours: 5 },
  risks: [], controls: [], findings: [], evidence: [] }
];

test("a filtered UTF-8 CSV and print view work from a saved report without network", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 601, name: "Auditor", role: "AUDITOR" }));
  });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/planning/report", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ scope: "Copia autorizada", rows }) }));
  await page.goto("/sin-conexion");
  await page.getByLabel("Frase local", { exact: true }).fill("Frase para informe local 2026");
  await page.getByLabel("Repetir frase local").fill("Frase para informe local 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Informe de portafolio" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Informe de portafolio: guardado (2 registros)")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { name: "Informe del portafolio" })).toBeVisible();
  await page.getByLabel("Año").selectOption("2026");
  await expect(page.getByText("1 auditoría en este informe filtrado.")).toBeVisible();
  await expect(page.getByText("Auditoría posterior")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV" }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
  expect(csv).toContain("AUD-1");
  expect(csv).not.toContain("AUD-2");
  expect(csv).toContain("'=SUM(1,1)");
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
  await page.getByRole("button", { name: "Imprimir o guardar PDF" }).click();
  expect(await page.evaluate(() => window.__printed)).toBe(true);
});
