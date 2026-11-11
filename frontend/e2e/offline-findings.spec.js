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
  await page.getByLabel("Causa raíz").fill("El control carece de una revisión independiente documentada.");
  await page.getByLabel("Severidad").selectOption("HIGH");
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
      expectedControlVersion: 1, title: "Control insuficiente",
      rootCause: "El control carece de una revisión independiente documentada.", severity: "HIGH" });
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
  await page.getByRole("button", { name: "Comparar contexto actual" }).click();
  await expect(page.getByText("Evaluaciones observadas: 1")).toBeVisible();
  await expect(page.getByText("Evaluaciones actuales: 2")).toBeVisible();
  await expect(page.getByText("Hallazgo para la evaluación original: sin coincidencia visible")).toBeVisible();
  expect(writes).toBe(0);
});

test("finding conflict comparison stops when the current account loses access", async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await stage(page);
  await context.setOffline(false);
  await page.unroute("**/api/controls/");
  await page.route("**/api/controls/", (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ controls: [control(2)] }) }));
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Conflicto de versión")).toBeVisible();
  await page.unroute("**/api/controls/");
  await page.route("**/api/controls/", (route) => route.fulfill({ status: 403,
    contentType: "application/json", body: JSON.stringify({ message: "Acceso revocado" }) }));
  await page.getByRole("button", { name: "Comparar contexto actual" }).click();
  await expect(page.getByRole("alert")).toContainText("Acceso revocado");
  await expect(page.getByText("Información visible ahora")).toHaveCount(0);
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

test("a legacy encrypted finding remains readable but cannot be submitted with missing required fields", async ({ page }) => {
  await prepare(page);
  await stage(page);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("vera-offline-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
    try {
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction("vaults").objectStore("vaults").get(`${location.origin}|701`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = reject;
      });
      const encoder = new TextEncoder();
      const material = await crypto.subtle.importKey("raw", encoder.encode("Frase exclusiva para hallazgos 2026"),
        "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: record.salt,
        iterations: 310000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false,
      ["encrypt", "decrypt"]);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv,
        additionalData: encoder.encode(record.scope) }, key, record.ciphertext);
      const data = JSON.parse(new TextDecoder().decode(plaintext));
      delete data.drafts[0].rootCause;
      delete data.drafts[0].severity;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
        additionalData: encoder.encode(record.scope) }, key, encoder.encode(JSON.stringify(data)));
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("vaults", "readwrite");
        transaction.objectStore("vaults").put({ ...record, iv, ciphertext: new Uint8Array(ciphertext), revision: record.revision + 1 });
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });
    } finally { db.close(); }
  });
  await page.reload();
  await page.getByLabel("Frase local", { exact: true }).fill("Frase exclusiva para hallazgos 2026");
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await expect(page.getByText("Control insuficiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Este borrador anterior no tiene causa raíz y severidad.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar hallazgo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Para enviar (0)" }).click();
  await expect(page.getByText("No hay trabajos en esta vista.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Revisar (1)" }).click();
  await expect(page.getByText("Control insuficiente", { exact: true })).toBeVisible();
});
