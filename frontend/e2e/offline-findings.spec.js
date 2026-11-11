import { test, expect } from "@playwright/test";

const control = (version = 1) => ({ id: "control-1", title: "Control de muestra",
  riskIds: ["risk-1"], effectiveness: 2,
  evaluations: Array.from({ length: version }, (_, index) => ({ version: index + 1, rating: 2 })) });
const risk = (ownerId = 701) => ({ id: "risk-1", title: "Riesgo de muestra", ownerId });

const prepare = async (page, { ownerId = 701, role = "AUDITOR", version = 1 } = {}) => {
  await page.addInitScript(({ currentRole }) => {
    localStorage.setItem("token", "browser-test-token");
    localStorage.setItem("user", JSON.stringify({ id: 701, name: "Usuario de prueba", role: currentRole }));
  }, { currentRole: role });
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/controls/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ controls: [control(version)] }) }));
  await page.route("**/api/risks/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ risks: [risk(ownerId)] }) }));
  await page.route("**/api/findings/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ findings: [] }) }));
  await page.goto("/sin-conexion", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva para hallazgos 2026");
  await page.getByLabel("Repetir frase local").fill("Frase exclusiva para hallazgos 2026");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("checkbox", { name: "Controles" }).check();
  await page.getByRole("checkbox", { name: "Riesgos" }).check();
  await page.getByRole("button", { name: "Actualizar secciones elegidas" }).click();
  await expect(page.getByText("Controles: guardado (1 registros)")).toBeVisible();
};

const stage = async (page) => {
  await page.getByLabel("Control y riesgo guardados").selectOption("0");
  await page.getByLabel("Nombre del hallazgo").fill("Control insuficiente");
  await page.getByLabel("Descripción del hallazgo").fill("La evaluación del control requiere revisión documentada.");
  await page.getByRole("button", { name: "Guardar hallazgo local" }).click();
  await expect(page.getByText("Pendiente de usar")).toBeVisible();
};

test("an encrypted finding draft is submitted once after fresh validation and explicit consent", async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await stage(page);
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
  expect(JSON.stringify(record)).not.toContain("Control insuficiente");
  await context.setOffline(false);
  let writes = 0;
  await page.unroute("**/api/findings/");
  await page.route("**/api/findings/", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ findings: [] }) });
    writes += 1;
    expect((await route.request().allHeaders())["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(route.request().postDataJSON()).toMatchObject({ controlId: "control-1", riskId: "risk-1",
      expectedControlVersion: 1, title: "Control insuficiente" });
    return route.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify({ finding: { id: "finding-1", controlId: "control-1", riskId: "risk-1" } }) });
  });
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByRole("button", { name: "Registrar hallazgo" })).toHaveCount(0);
});

test("a changed evaluation blocks submission before creating a finding", async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await stage(page);
  await context.setOffline(false);
  await page.unroute("**/api/controls/");
  await page.route("**/api/controls/", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ controls: [control(2)] }) }));
  let writes = 0;
  await page.route("**/api/findings/", (route) => {
    if (route.request().method() === "POST") writes += 1;
    return route.fallback();
  });
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Conflicto de versión")).toBeVisible();
  expect(writes).toBe(0);
});

test("an uncertain reply requires review and prevents an automatic repeat", async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await stage(page);
  await context.setOffline(false);
  let writes = 0;
  await page.route("**/api/findings/", (route) => {
    if (route.request().method() === "POST") { writes += 1; return route.abort("failed"); }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Confirmación pendiente")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar hallazgos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar hallazgo" })).toHaveCount(0);
  expect(writes).toBe(1);
});

test("an explicit retry reuses the same finding operation after a lost response", async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await stage(page);
  await context.setOffline(false);
  const keys = [];
  await page.route("**/api/findings/", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    keys.push((await route.request().allHeaders())["idempotency-key"]);
    if (keys.length === 1) return route.abort("failed");
    return route.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify({ finding: { id: "finding-1", controlId: "control-1", riskId: "risk-1" } }) });
  });
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Confirmación pendiente")).toBeVisible();
  await page.getByRole("button", { name: "Comprobar o reintentar hallazgo" }).click();
  await expect(page.getByText("Enviado al servidor")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
});

test("auditors cannot stage findings for risks they do not own", async ({ page }) => {
  await prepare(page, { ownerId: 702 });
  await expect(page.getByRole("button", { name: "Guardar hallazgo local" })).toBeDisabled();
  await expect(page.getByText("Solo aparecerán relaciones elegibles en las copias vigentes.")).toBeVisible();
});
