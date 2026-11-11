import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Buffer } from "node:buffer";
import { useSession } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/assistant/brief", (route) => route.fulfill({ json: { role: "AUDITOR", signals: [] } }));
  await page.route("**/api/assistant/insights", (route) => route.fulfill({ json: { insights: [], partial: false } }));
});

async function showHistory(page) {
  const header = page.locator(".assistant-conversation-header");
  await expect(header.getByRole("button", { name: /historial/i })).toBeVisible();
  const toggle = header.getByRole("button", { name: "Mostrar historial" });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator(".assistant-history")).toBeVisible();
}

async function hideHistoryOnNarrow(page) {
  if (page.viewportSize()?.width > 1080) return;
  const toggle = page.locator(".assistant-rail-heading").getByRole("button", { name: "Ocultar historial" });
  if (await toggle.isVisible()) await toggle.click();
}

async function openConversationOptions(page) {
  const toggle = page.getByRole("button", { name: "Opciones de conversación" });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function openComposerContext(page) {
  const toggle = page.getByRole("button", { name: "Añadir contexto" });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function openAttachmentTray(page) {
  await openComposerContext(page);
  await page.getByRole("button", { name: "Archivos y adjuntos" }).click();
  await expect(page.getByLabel("Adjuntar archivo privado")).toBeVisible();
}

test("Espacio de IA: la lista lateral permite cambiar de conversación y cerrarse", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true
  } }));
  const threads = [
    { id: "11111111-1111-4111-8111-111111111111", title: "Riesgos del trimestre", focus: null, version: 1 },
    { id: "22222222-2222-4222-8222-222222222222", title: "Pendientes de auditoría", focus: null, version: 1 }
  ];
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/conversations")) return route.fulfill({ json: { conversations: threads } });
    const selected = threads.find((item) => path.endsWith(`/${item.id}`));
    if (selected) return route.fulfill({ json: { conversation: { ...selected, messages: [], stale: false } } });
    return route.abort();
  });
  await page.goto("/asistente");
  const skipToQuestion = page.getByRole("button", { name: "Ir al campo de pregunta" });
  await expect(skipToQuestion).toBeEnabled();
  await skipToQuestion.focus();
  await skipToQuestion.press("Enter");
  await expect(page.getByLabel("Tu pregunta")).toBeFocused();
  await showHistory(page);
  const recent = page.getByRole("navigation", { name: "Conversaciones privadas" });
  await expect(recent.getByRole("button", { name: "Riesgos del trimestre" })).toBeVisible();
  await recent.getByRole("button", { name: "Pendientes de auditoría" }).click();
  await expect(page.getByRole("heading", { name: "Pendientes de auditoría" })).toBeVisible();
  await showHistory(page);
  await expect(recent.getByRole("button", { name: "Pendientes de auditoría" })).toHaveAttribute("aria-current", "page");
  await hideHistoryOnNarrow(page);
  await openComposerContext(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Añadir contexto" }).press("Escape");
  await expect(page.getByRole("button", { name: "Añadir contexto" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Añadir contexto" })).toBeFocused();
  await openComposerContext(page);
  await page.getByRole("heading", { name: "Pendientes de auditoría" }).click();
  await expect(page.getByRole("button", { name: "Añadir contexto" })).toHaveAttribute("aria-expanded", "false");
  await openConversationOptions(page);
  await page.getByRole("button", { name: "Opciones de conversación" }).press("Escape");
  await expect(page.getByRole("button", { name: "Opciones de conversación" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Opciones de conversación" })).toBeFocused();
  await openConversationOptions(page);
  await page.getByRole("heading", { name: "Pendientes de auditoría" }).click();
  await expect(page.getByRole("button", { name: "Opciones de conversación" })).toHaveAttribute("aria-expanded", "false");
  await showHistory(page);
  await page.locator(".assistant-rail-heading").getByRole("button", { name: "Ocultar historial" }).click();
  await expect(page.locator(".assistant-conversation-header").getByRole("button", { name: "Mostrar historial" })).toBeVisible();
});

test("Espacio de IA: Enter envía y Shift+Enter conserva una nueva línea", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: false
  } }));
  let sent = null;
  await page.route("**/api/assistant/ask", (route) => {
    sent = route.request().postDataJSON().question;
    return route.fulfill({ json: { answer: "Respuesta de prueba", mode: "generated", citations: [] } });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value) => { window.__copiedAnswer = value; }
    } });
  });
  await page.goto("/asistente");
  const input = page.getByLabel("Tu pregunta");
  await expect(page.locator(".assistant-chat")).not.toHaveClass(/assistant-chat--history-open/);
  await input.fill("¿Qué auditorías tengo?");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("¿Qué auditorías tengo?\n");
  expect(sent).toBeNull();
  await input.type("Resume mis pendientes");
  await input.press("Enter");
  await expect(page.getByText("Respuesta de prueba")).toBeVisible();
  expect(sent).toBe("¿Qué auditorías tengo?\nResume mis pendientes");
  await page.getByRole("button", { name: "Copiar respuesta" }).click();
  await expect(page.getByRole("status").getByText("Respuesta copiada")).toBeVisible();
  expect(await page.evaluate(() => window.__copiedAnswer)).toBe("Respuesta de prueba");
});

test("Voz: detener el dictado antes de recibir sesión no envía una pregunta", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: false, speech: true
  } }));
  let releaseToken;
  const gate = new Promise((resolve) => { releaseToken = resolve; });
  await page.route("**/api/assistant/speech/token", async (route) => {
    await gate;
    return route.fulfill({ json: { token: "temporary-test-token", region: "eastus2", expiresIn: 600 } });
  });
  let sent = 0;
  await page.route("**/api/assistant/ask", (route) => { sent += 1; return route.abort(); });
  await page.goto("/asistente");
  const requested = page.waitForRequest("**/api/assistant/speech/token");
  await page.getByRole("button", { name: "Dictar pregunta" }).click();
  await requested;
  await expect(page.getByRole("button", { name: "Detener dictado" })).toBeVisible();
  await page.getByRole("button", { name: "Detener dictado" }).click();
  releaseToken();
  await expect(page.getByLabel("Tu pregunta")).toHaveValue("");
  await expect(page.getByText("Dictado detenido. Revisa el texto antes de enviarlo.")).toBeVisible();
  expect(sent).toBe(0);
});

test("Espacio de IA: explora expedientes y continúa sin salir del chat", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: false
  } }));
  const requests = [];
  await page.route("**/api/assistant/ask", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const second = body.question === "siguientes";
    return route.fulfill({ json: {
      answer: second ? "Muestro 11–11 de 11." : "Muestro 1–10 de 11. Escribe «siguientes» para continuar.",
      mode: "browse", citations: [], references: [],
      browse: { type: "risks", filter: "high", offset: second ? 10 : 0, total: 11,
        hasMore: !second, items: [{ sourceId: `risks:RSK-${second ? 11 : 1}`,
          id: `RSK-${second ? 11 : 1}`, type: "Riesgo", title: `Riesgo ${second ? 11 : 1}`,
          path: `/riesgos#risk-RSK-${second ? 11 : 1}`, facts: [{ label: "Nivel", value: "Alto" }] }] }
    } });
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Muéstrame los riesgos altos");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Riesgo: Riesgo 1")).toBeVisible();
  await expect(page.getByText("Nivel: Alto")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("siguientes");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Riesgo: Riesgo 11")).toBeVisible();
  expect(requests[1].lastBrowse).toMatchObject({ type: "risks", filter: "high", offset: 0, hasMore: true });
});

test("Espacio de IA: avisa si faltan compromisos en las prioridades", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: false
  } }));
  await page.route("**/api/assistant/brief", (route) => route.fulfill({ json: {
    role: "AUDITOR", pendingActionsUnavailable: true,
    signals: [{ key: "highRisks", label: "Riesgos altos", count: 2, path: "/riesgos" }]
  } }));
  await page.goto("/asistente");
  await expect(page.getByText("Los compromisos no están disponibles", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Prioridades actuales" }).getByText("Riesgos altos")).toBeVisible();
});

test("Copiloto: OCR opcional de PDF escaneado mantiene la consulta explícita", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true, attachments: true, pdfOcr: true
  } }));
  const threadId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  let thread = null;
  let file = null;
  let ocrCalls = 0;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") {
      return route.fulfill({ json: { conversations: thread ? [thread] : [] } });
    }
    if (path.endsWith("/conversations") && method === "POST") {
      thread = { id: threadId, title: "Nueva conversación", focus: null, messages: [], version: 1 };
      return route.fulfill({ status: 201, json: { conversation: thread } });
    }
    if (path.endsWith(`/${threadId}/attachments`) && method === "GET") {
      return route.fulfill({ json: { attachments: file ? [file] : [] } });
    }
    if (path.endsWith(`/${threadId}/attachments`) && method === "POST") {
      file = { id: fileId, name: "escaneo.pdf", mime: "application/pdf", size: 1200,
        status: "no-text", truncated: false, chunks: 0 };
      return route.fulfill({ status: 201, json: { attachment: file } });
    }
    if (path.endsWith(`/${threadId}/attachments/${fileId}/ocr`) && method === "POST") {
      ocrCalls += 1;
      file = { ...file, status: "ready", truncated: true, chunks: 1 };
      return route.fulfill({ json: { attachment: file } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await openAttachmentTray(page);
  await page.getByLabel("Adjuntar archivo privado").setInputFiles({ name: "escaneo.pdf",
    mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nscan") });
  await expect(page.getByRole("button", { name: "Extraer texto del PDF" })).toBeVisible();
  expect(ocrCalls).toBe(0);
  await expect(page.getByText("como máximo las dos primeras páginas", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Extraer texto del PDF" }).click();
  await expect(page.getByRole("button", { name: "Extraer texto del PDF" })).toHaveCount(0);
  await expect(page.getByLabel("Consultar archivo")).toHaveValue(fileId);
  await expect(page.getByText("lectura parcial", { exact: false })).toBeVisible();
  expect(ocrCalls).toBe(1);
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
});

test("Copiloto: adjunta un documento privado y lo consulta con cita", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true, attachments: true
  } }));
  const threadId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  let thread = null;
  let file = null;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") {
      return route.fulfill({ json: { conversations: thread ? [thread] : [] } });
    }
    if (path.endsWith("/conversations") && method === "POST") {
      thread = { id: threadId, title: "Nueva conversación", focus: null, messages: [], version: 1 };
      return route.fulfill({ status: 201, json: { conversation: thread } });
    }
    if (path.endsWith(`/${threadId}`) && method === "GET") {
      return route.fulfill({ json: { conversation: { ...thread, stale: false } } });
    }
    if (path.endsWith("/attachments") && method === "GET") {
      return route.fulfill({ json: { attachments: file ? [file] : [] } });
    }
    if (path.endsWith("/attachments") && method === "POST") {
      file = { id: fileId, name: "nota.txt", mime: "text/plain", size: 28, status: "ready",
        truncated: false, chunks: 1 };
      return route.fulfill({ status: 201, json: { attachment: file } });
    }
    if (path.endsWith(`/${threadId}/ask`) && method === "POST") {
      expect(route.request().postDataJSON().attachmentId).toBe(fileId);
      const userMessage = { id: "user-1", role: "user", text: "¿Qué dice proveedor X?",
        attachmentName: file.name };
      const message = { id: "assistant-1", role: "assistant", text: "El proveedor X tiene riesgo alto.",
        mode: "attachment-text", citations: [{ sourceId: `attachment:${fileId}:chunk:0`,
          attachmentId: fileId, type: "Archivo adjunto", title: file.name,
          excerpt: "El proveedor X tiene riesgo alto." }], references: [] };
      thread.messages = [userMessage, message]; thread.version += 1;
      return route.fulfill({ json: { version: thread.version, userMessage, message } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await openAttachmentTray(page);
  await page.getByLabel("Adjuntar archivo privado").setInputFiles({
    name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("El proveedor X tiene riesgo alto.")
  });
  await expect(page.getByLabel("Consultar archivo")).toHaveValue(fileId);
  await page.getByLabel("Tu pregunta").fill("¿Qué dice proveedor X?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("El proveedor X tiene riesgo alto.", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Archivo consultado: nota.txt")).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
});

test("Copiloto: vincula un archivo seleccionado como evidencia con vista previa y confirmación", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true, attachments: true
  } }));
  const threadId = "11111111-1111-4111-8111-111111111129";
  const fileId = "22222222-2222-4222-8222-222222222229";
  let version = 1;
  let file = null;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id: threadId, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith("/attachments") && method === "GET") return route.fulfill({ json: { attachments: file ? [file] : [] } });
    if (path.endsWith("/attachments") && method === "POST") {
      file = { id: fileId, name: "acta.txt", mime: "text/plain", size: 56,
        status: "ready", truncated: false, chunks: 1 };
      return route.fulfill({ status: 201, json: { attachment: file } });
    }
    if (path.endsWith(`/${threadId}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      if (question === "Vincula este archivo como evidencia") {
        expect(route.request().postDataJSON().attachmentId).toBe(fileId);
      }
      version += 1;
      const executed = question === "Confirmar archivo como evidencia";
      const message = { id: `assistant-file-${version}`, role: "assistant", citations: [], references: [],
        mode: executed ? "action-executed" : question.startsWith("Título:") ? "action-preview" : "action-guidance",
        text: executed ? "El archivo quedó registrado como evidencia EVD-010 en AUDIT AUD-01." :
          question.startsWith("Título:") ? "Revisa antes de vincular acta.txt. Escribe «Confirmar archivo como evidencia»." :
            "Con un archivo privado seleccionado, envía Título, Descripción, Tipo, Entidad e Identificador." };
      return route.fulfill({ json: { conversationId: threadId, version,
        userMessage: { id: `user-file-${version}`, role: "user", text: question }, message,
        historySaved: true } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await openAttachmentTray(page);
  await page.getByLabel("Adjuntar archivo privado").setInputFiles({ name: "acta.txt",
    mimeType: "text/plain", buffer: Buffer.from("Acta de revisión de auditoría con hallazgos documentados.") });
  await expect(page.getByLabel("Consultar archivo")).toHaveValue(fileId);
  await expect(page.getByText(/Para guardar este archivo en un expediente/)).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Vincula este archivo como evidencia");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Con un archivo privado seleccionado/)).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Título: Acta de revisión\nDescripción: Documento que respalda la revisión del proceso auditado\nTipo: documento\nEntidad: auditoría\nIdentificador: AUD-01");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar archivo como evidencia");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/El archivo quedó registrado como evidencia EVD-010/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: Super Admin revisa una solicitud de rol sin salir del chat", async ({ page }) => {
  await useSession(page, "SUPER_ADMIN", 1);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111130";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar revisión de rol";
      const preview = question === "Aprueba solicitud de rol #7";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-role-review-${version}`, role: "user", text: question },
        message: { id: `assistant-role-review-${version}`, role: "assistant",
          text: executed ? "La solicitud de rol #7 quedó aprobada. La cuenta debe iniciar sesión de nuevo." :
            preview ? "Revisa la decisión: Auditor → Gerente. Escribe «Confirmar revisión de rol»." :
              "Hay 1 solicitud pendiente: #7, Auditor → Gerente.",
          mode: executed ? "action-executed" : preview ? "action-preview" : "action-guidance",
          citations: [], references: [] }, historySaved: true } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Solicitudes de rol pendientes");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Hay 1 solicitud pendiente/)).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Aprueba solicitud de rol #7");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar revisión de rol");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/La solicitud de rol #7 quedó aprobada/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: memoria visible, editable, pausada y borrable", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true, memory: true
  } }));
  await page.route("**/api/assistant/conversations", (route) => route.fulfill({ json: { conversations: [] } }));
  const id = "33333333-3333-4333-8333-333333333333";
  let note = null;
  await page.route("**/api/assistant/memories**", (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { memories: note ? [note] : [] } });
    if (method === "POST") {
      note = { id, content: route.request().postDataJSON().content, enabled: true, version: 1 };
      return route.fulfill({ status: 201, json: { memory: note } });
    }
    if (method === "PATCH") {
      note = { ...note, ...route.request().postDataJSON(), version: note.version + 1 };
      return route.fulfill({ json: { memory: note } });
    }
    if (method === "DELETE") { note = null; return route.fulfill({ status: 204, body: "" }); }
    return route.abort();
  });
  await page.goto("/asistente");
  await showHistory(page);
  await page.getByRole("button", { name: /Memoria personalizada/ }).click();
  await page.getByRole("button", { name: "Añadir nota" }).click();
  await page.getByLabel("Nota para futuras conversaciones").fill("Prefiero respuestas breves");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByText("Prefiero respuestas breves")).toBeVisible();
  await page.reload();
  await showHistory(page);
  await page.getByRole("button", { name: /Memoria personalizada/ }).click();
  await expect(page.getByText("Prefiero respuestas breves")).toBeVisible();
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByText("(pausada)")).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nota para futuras conversaciones").fill("Prefiero tablas breves");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByText("Prefiero tablas breves")).toBeVisible();
  await page.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("button", { name: "Sí, borrar nota" }).click();
  await expect(page.getByText("No hay notas guardadas.")).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
});

test("Copiloto: proyectos privados agrupan hilos y borrarlos conserva el historial", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true, projects: true
  } }));
  const projectId = "22222222-2222-4222-8222-222222222222";
  const threadId = "11111111-1111-4111-8111-111111111111";
  let project = null;
  let thread = null;
  await page.route("**/api/assistant/projects**", (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { projects: project ? [project] : [] } });
    if (method === "POST") {
      project = { id: projectId, ...route.request().postDataJSON(), version: 1 };
      return route.fulfill({ status: 201, json: { project } });
    }
    if (method === "PATCH") {
      project = { ...project, ...route.request().postDataJSON(), version: project.version + 1 };
      return route.fulfill({ json: { project } });
    }
    if (method === "DELETE") {
      project = null;
      if (thread) { thread.projectId = null; thread.version += 1; }
      return route.fulfill({ status: 204, body: "" });
    }
    return route.abort();
  });
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") {
      return route.fulfill({ json: { conversations: thread ? [thread] : [] } });
    }
    if (path.endsWith("/conversations") && method === "POST") {
      thread = { id: threadId, title: "Nueva conversación", focus: null,
        projectId: route.request().postDataJSON().projectId, messages: [], version: 1 };
      return route.fulfill({ status: 201, json: { conversation: thread } });
    }
    if (path.endsWith(`/${threadId}`) && method === "GET") {
      return route.fulfill({ json: { conversation: { ...thread, stale: false } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await showHistory(page);
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByLabel("Nombre del proyecto").fill("Auditoría anual");
  await page.getByLabel("Preferencias para respuestas de este proyecto (opcional)").fill("Responde en tres puntos");
  await page.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(page.getByLabel("Proyecto", { exact: true })).toHaveValue(projectId);
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await openConversationOptions(page);
  await expect(page.getByRole("button", { name: "Renombrar conversación" })).toBeVisible();
  await showHistory(page);
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" }).getByRole("button", { name: "Nueva conversación" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await showHistory(page);
  await page.getByLabel("Proyecto", { exact: true }).selectOption(projectId);
  await showHistory(page);
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" }).getByRole("button", { name: "Nueva conversación" })).toBeVisible();
  await page.getByRole("button", { name: "Editar proyecto" }).click();
  await expect(page.getByLabel("Preferencias para respuestas de este proyecto (opcional)"))
    .toHaveValue("Responde en tres puntos");
  await page.getByLabel("Preferencias para respuestas de este proyecto (opcional)").fill("Cita primero las fuentes");
  await page.getByRole("button", { name: "Guardar proyecto" }).click();
  await page.reload();
  await showHistory(page);
  await page.getByLabel("Proyecto", { exact: true }).selectOption(projectId);
  await showHistory(page);
  await page.getByRole("button", { name: "Editar proyecto" }).click();
  await expect(page.getByLabel("Preferencias para respuestas de este proyecto (opcional)"))
    .toHaveValue("Cita primero las fuentes");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Eliminar proyecto" }).click();
  await page.getByRole("button", { name: "Sí, eliminar proyecto" }).click();
  await expect(page.getByLabel("Proyecto", { exact: true })).toHaveValue("");
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" }).getByRole("button", { name: "Nueva conversación" })).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
});

test("Copiloto: biblioteca privada de proyecto disponible en chats nuevos", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true, projects: true,
    attachments: true, projectFiles: true, projectKnowledge: true, projectSemantic: true
  } }));
  const projectId = "22222222-2222-4222-8222-222222222222";
  const threadId = "11111111-1111-4111-8111-111111111111";
  const fileId = "33333333-3333-4333-8333-333333333333";
  let project = null;
  let file = null;
  await page.route("**/api/assistant/projects**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith(`/projects/${projectId}/files`) && method === "GET") {
      return route.fulfill({ json: { files: file ? [file] : [] } });
    }
    if (path.endsWith(`/projects/${projectId}/files`) && method === "POST") {
      file = { id: fileId, projectId, name: "guia.txt", mime: "text/plain", size: 29,
        status: "ready", truncated: false, chunks: 1, semanticReady: false };
      return route.fulfill({ status: 201, json: { file } });
    }
    if (path.endsWith(`/projects/${projectId}/files/${fileId}/semantic`) && method === "POST") {
      file.semanticReady = true;
      return route.fulfill({ json: { indexedChunks: 1, alreadyIndexed: false } });
    }
    if (path.endsWith(`/projects/${projectId}/files/${fileId}`) && method === "DELETE") {
      file = null; return route.fulfill({ status: 204, body: "" });
    }
    if (path.endsWith("/projects") && method === "GET") {
      return route.fulfill({ json: { projects: project ? [project] : [] } });
    }
    if (path.endsWith("/projects") && method === "POST") {
      project = { id: projectId, ...route.request().postDataJSON(), version: 1 };
      return route.fulfill({ status: 201, json: { project } });
    }
    return route.abort();
  });
  let thread = null;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") {
      return route.fulfill({ json: { conversations: thread ? [thread] : [] } });
    }
    if (path.endsWith("/conversations") && method === "POST") {
      thread = { id: threadId, title: "Nueva conversación", projectId,
        focus: null, messages: [], version: 1 };
      return route.fulfill({ status: 201, json: { conversation: thread } });
    }
    if (path.endsWith(`/${threadId}/attachments`) && method === "GET") {
      return route.fulfill({ json: { attachments: [] } });
    }
    if (path.endsWith(`/${threadId}/ask`) && method === "POST") {
      const payload = route.request().postDataJSON();
      if (payload.projectFiles) {
        expect(payload.attachmentId).toBeNull();
        const userMessage = { id: "user-2", role: "user", text: "¿Qué indica la biblioteca?",
          attachmentName: "Biblioteca del proyecto" };
        const message = { id: "answer-2", role: "assistant", text: "La biblioteca indica un riesgo de proveedor.",
          mode: "attachment-project", citations: [{ sourceId: `attachment:${fileId}:chunk:0`,
            attachmentId: fileId, projectId, type: "Archivo del proyecto", title: "guia.txt",
            excerpt: "Riesgo de proveedor" }], coverage: { partial: true } };
        thread.messages.push(userMessage, message);
        return route.fulfill({ json: { version: 3, userMessage, message } });
      }
      expect(payload.attachmentId).toBe(fileId);
      const userMessage = { id: "user-1", role: "user", text: "¿Qué dice la guía?", attachmentName: "guia.txt" };
      const message = { id: "answer-1", role: "assistant", text: "La guía menciona un riesgo de proveedor.",
        mode: "attachment-text", citations: [{ sourceId: `attachment:${fileId}:chunk:0`, attachmentId: fileId,
          projectId, type: "Archivo adjunto", title: "guia.txt", excerpt: "Riesgo de proveedor" }] };
      thread.messages = [userMessage, message];
      return route.fulfill({ json: { version: 2, userMessage, message } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await showHistory(page);
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByLabel("Nombre del proyecto").fill("Revisión anual");
  await page.getByRole("button", { name: "Guardar proyecto" }).click();
  await page.getByLabel("Archivos del proyecto").setInputFiles({ name: "guia.txt",
    mimeType: "text/plain", buffer: Buffer.from("Riesgo de proveedor presente.") });
  await expect(page.getByRole("option", { name: "guia.txt · proyecto" })).toBeAttached();
  await page.getByRole("button", { name: "Mejorar búsqueda" }).click();
  await expect(page.getByText("Búsqueda semántica lista")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("¿Qué dice la guía?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("La guía menciona un riesgo de proveedor.")).toBeVisible();
  await openAttachmentTray(page);
  await expect(page.getByLabel("Consultar archivo")).toHaveValue(fileId);
  await page.getByLabel("Consultar archivo").selectOption("__project_library__");
  await page.getByLabel("Tu pregunta").fill("¿Qué indica la biblioteca?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("La biblioteca indica un riesgo de proveedor.")).toBeVisible();
  await expect(page.getByText("La lectura de la biblioteca fue parcial", { exact: false })).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
  await openAttachmentTray(page);
  await page.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(page.getByRole("option", { name: "guia.txt · proyecto" })).toHaveCount(0);
});

test("Copiloto: reabre, renombra y elimina un historial privado persistente", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "read-only", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111111";
  let thread = null;
  let stale = false;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") {
      return route.fulfill({ json: { conversations: thread ? [thread] : [] } });
    }
    if (path.endsWith("/conversations") && method === "POST") {
      thread = { id, title: "Nueva conversación", focus: null, messages: [], version: 1,
        createdAt: "2026-10-22T18:00:00.000Z", updatedAt: "2026-10-22T18:00:00.000Z" };
      return route.fulfill({ status: 201, json: { conversation: thread } });
    }
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const userMessage = { id: "user-1", role: "user", text: question };
      const message = { id: "assistant-1", role: "assistant", text: "Riesgos altos en tu alcance: 2.",
        mode: "computed", citations: [], references: [], asOf: "2026-10-22T18:00:00.000Z",
        feedbackToken: "not-for-export" };
      thread.messages = [userMessage, message]; thread.version += 1;
      return route.fulfill({ json: { conversationId: id, version: thread.version, userMessage, message } });
    }
    if (path.endsWith(`/${id}`) && method === "GET") {
      return route.fulfill({ json: { conversation: { ...thread, messages: stale ? [] : thread.messages, stale } } });
    }
    if (path.endsWith(`/${id}`) && method === "PATCH") {
      thread.title = route.request().postDataJSON().title; thread.version += 1;
      return route.fulfill({ json: { conversation: thread } });
    }
    if (path.endsWith(`/${id}`) && method === "DELETE") {
      thread = null; return route.fulfill({ status: 204, body: "" });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await showHistory(page);
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" })).toBeVisible();
  await hideHistoryOnNarrow(page);
  await page.getByLabel("Tu pregunta").fill("¿Cuántos riesgos altos tengo?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Riesgos altos en tu alcance: 2.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Riesgos altos en tu alcance: 2.")).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id }) => id)).toEqual([]);
  await openConversationOptions(page);
  await page.getByRole("button", { name: "Renombrar conversación" }).click();
  await page.getByLabel("Nuevo nombre").fill("Riesgos del período");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await showHistory(page);
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" }).getByRole("button", { name: "Riesgos del período" })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Buscar conversaciones por título").fill("periodo");
  await expect(page.getByRole("navigation", { name: "Conversaciones privadas" }).getByRole("button", { name: "Riesgos del período" })).toBeVisible();
  await page.getByLabel("Buscar conversaciones por título").fill("inexistente");
  await expect(page.getByText("0 de 1 conversaciones")).toBeVisible();
  await page.getByLabel("Buscar conversaciones por título").clear();
  await hideHistoryOnNarrow(page);
  const downloadPromise = page.waitForEvent("download");
  await openConversationOptions(page);
  await page.getByRole("button", { name: "Exportar conversación privada" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`vera-conversacion-${id}.json`);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.conversation.title).toBe("Riesgos del período");
  expect(exported.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
  expect(exported.messages[1].feedbackToken).toBeUndefined();
  stale = true;
  await openConversationOptions(page);
  await page.getByRole("button", { name: "Exportar conversación privada" }).click();
  await openConversationOptions(page);
  await expect(page.getByRole("button", { name: "Exportar conversación privada" })).toBeDisabled();
  await expect(page.getByText(/Cambió tu alcance de datos/).first()).toBeVisible();
  await page.getByRole("button", { name: "Eliminar conversación" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByText("Riesgos altos en tu alcance: 2.")).toHaveCount(0);
});

test("Copiloto: explica la vista previa y el cambio confirmado en la conversación", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111112";
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version: 1 } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar cambio";
      return route.fulfill({ json: { conversationId: id, version: executed ? 3 : 2,
        userMessage: { id: executed ? "user-2" : "user-1", role: "user", text: question },
        message: { id: executed ? "assistant-2" : "assistant-1", role: "assistant",
          text: executed ? "Quedó completado el compromiso «Revisar evidencia»." :
            "Revisa antes de ejecutar: completar «Revisar evidencia». Escribe «Confirmar cambio».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await expect(page.getByText("Consultas y acciones")).toHaveCount(1);
  await page.getByLabel("Tu pregunta").fill("Completa el compromiso «Revisar evidencia» porque quedó documentado.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar cambio");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Cambio registrado con las reglas de VERA")).toBeVisible();
  const access = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(access.violations.map(({ id: violation }) => violation)).toEqual([]);
});

test("Copiloto: exporta el informe CSV desde el chat sin navegar a otro módulo", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111113";
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version: 1 } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") return route.fulfill({ json: {
      conversationId: id, version: 2, downloadCsv: '\uFEFF"ID auditoría","Título"\r\n"AUD-01","Auditoría visible"\r\n',
      userMessage: { id: "user-report", role: "user", text: "Exporta el reporte del portafolio en CSV" },
      message: { id: "assistant-report", role: "assistant", mode: "report-export",
        text: "Preparé el CSV con todos los registros visibles; la descarga comenzará en tu navegador.",
        citations: [], references: [] } } });
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Exporta el reporte del portafolio en CSV");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("vera-reporte-portafolio.csv");
  await expect(page.getByText("Reporte completo · descarga CSV solicitada")).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: confirma una decisión de planificación sin salir del chat", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111114";
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version: 1 } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar cambio";
      return route.fulfill({ json: { conversationId: id, version: executed ? 3 : 2,
        userMessage: { id: executed ? "user-plan-2" : "user-plan-1", role: "user", text: question },
        message: { id: executed ? "assistant-plan-2" : "assistant-plan-1", role: "assistant",
          text: executed ? "Quedó aprobada «Auditoría de accesos»." :
            "Revisa antes de ejecutar: aprobar «Auditoría de accesos» para Q4. Escribe «Confirmar cambio».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Aprueba la propuesta «Auditoría de accesos» para Q4 porque cumple los criterios de planeación.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar cambio");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Quedó aprobada «Auditoría de accesos».")).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: crea una propuesta desde el chat con vista previa y confirmación", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111118";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar propuesta";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-proposal-${version}`, role: "user", text: question },
        message: { id: `assistant-proposal-${version}`, role: "assistant",
          text: executed ? "Quedó creada la propuesta «Auditoría de accesos» con identificador AUD-04." :
            "Revisa la propuesta: Auditoría de accesos. Escribe «Confirmar propuesta».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Crear propuesta de auditoría de accesos");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar propuesta");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó creada la propuesta «Auditoría de accesos»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: registra un riesgo desde el chat con vista previa y confirmación", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111119";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar riesgo";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-risk-create-${version}`, role: "user", text: question },
        message: { id: `assistant-risk-create-${version}`, role: "assistant",
          text: executed ? "Quedó registrado el riesgo «Accesos sin revisión» con identificador RSK-004." :
            "Revisa el riesgo: Accesos sin revisión. Escribe «Confirmar riesgo».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Registrar riesgo de accesos sin revisión");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar riesgo");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó registrado el riesgo «Accesos sin revisión»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: registra un control desde el chat con vista previa y confirmación", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111120";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar control nuevo";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-control-create-${version}`, role: "user", text: question },
        message: { id: `assistant-control-create-${version}`, role: "assistant",
          text: executed ? "Quedó registrado el control «Revisión mensual» con identificador CTL-004." :
            "Revisa el control: Revisión mensual. Escribe «Confirmar control nuevo».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Registrar control para revisar accesos");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar control nuevo");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó registrado el control «Revisión mensual»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: registra una referencia de evidencia desde el chat", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111127";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar evidencia";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-evidence-create-${version}`, role: "user", text: question },
        message: { id: `assistant-evidence-create-${version}`, role: "assistant",
          text: executed ? "Quedó registrada la evidencia «Acta de revisión» con identificador EVD-004." :
            "Revisa la evidencia: Acta de revisión. Escribe «Confirmar evidencia».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Registrar evidencia para la auditoría AUD-01");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar evidencia");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó registrada la evidencia «Acta de revisión»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: comenta una auditoría desde el chat sin salir del expediente", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111128";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar comentario";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-comment-${version}`, role: "user", text: question },
        message: { id: `assistant-comment-${version}`, role: "assistant",
          text: executed ? "Quedó registrado el comentario CMT-004 en el expediente AUD-01." :
            "Revisa antes de comentar AUD-01. Escribe «Confirmar comentario».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Comenta la auditoría AUD-01: La revisión quedó documentada.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar comentario");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó registrado el comentario CMT-004/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: registra un hallazgo desde el chat con vista previa y confirmación", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111121";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar hallazgo";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-finding-create-${version}`, role: "user", text: question },
        message: { id: `assistant-finding-create-${version}`, role: "assistant",
          text: executed ? "Quedó registrado el hallazgo «Revisión incompleta» con identificador FDG-004." :
            "Revisa el hallazgo: Revisión incompleta. Escribe «Confirmar hallazgo».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Registrar hallazgo por revisión incompleta");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar hallazgo");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó registrado el hallazgo «Revisión incompleta»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: cierra un hallazgo confirmado sin navegar", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111122";
  let version = 1;
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar cierre de hallazgo";
      version += 1;
      return route.fulfill({ json: { conversationId: id, version,
        userMessage: { id: `user-finding-close-${version}`, role: "user", text: question },
        message: { id: `assistant-finding-close-${version}`, role: "assistant",
          text: executed ? "Quedó cerrado el hallazgo «Revisión incompleta» (FDG-004)." :
            "Revisa antes de cerrar «Revisión incompleta». Escribe «Confirmar cierre de hallazgo».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Cierra el hallazgo FDG-004 porque todas las acciones vinculadas terminaron.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar cierre de hallazgo");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText(/Quedó cerrado el hallazgo «Revisión incompleta»/)).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: confirma una evaluación de riesgo sin salir del chat", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111115";
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version: 1 } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar evaluación";
      return route.fulfill({ json: { conversationId: id, version: executed ? 3 : 2,
        userMessage: { id: executed ? "user-risk-2" : "user-risk-1", role: "user", text: question },
        message: { id: executed ? "assistant-risk-2" : "assistant-risk-1", role: "assistant",
          text: executed ? "Quedó evaluado «Acceso indebido»: Alto (6/9)." :
            "Revisa antes de ejecutar: evaluar «Acceso indebido». Escribe «Confirmar evaluación».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Evalúa el riesgo «Acceso indebido» con probabilidad 3 e impacto 2 porque la exposición afecta varios procesos.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar evaluación");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Quedó evaluado «Acceso indebido»: Alto (6/9).")).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: confirma una evaluación de control sin salir del chat", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: {
    available: true, mode: "consult-and-confirm", conversations: true
  } }));
  const id = "11111111-1111-4111-8111-111111111116";
  await page.route("**/api/assistant/conversations**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/conversations") && method === "GET") return route.fulfill({ json: { conversations: [] } });
    if (path.endsWith("/conversations") && method === "POST") return route.fulfill({ status: 201,
      json: { conversation: { id, title: "Nueva conversación", focus: null, messages: [], version: 1 } } });
    if (path.endsWith(`/${id}/ask`) && method === "POST") {
      const question = route.request().postDataJSON().question;
      const executed = question === "Confirmar control";
      return route.fulfill({ json: { conversationId: id, version: executed ? 3 : 2,
        userMessage: { id: executed ? "user-control-2" : "user-control-1", role: "user", text: question },
        message: { id: executed ? "assistant-control-2" : "assistant-control-1", role: "assistant",
          text: executed ? "Quedó evaluado «Conciliación mensual»: inefectivo (2/5)." :
            "Revisa antes de ejecutar: evaluar «Conciliación mensual». Escribe «Confirmar control».",
          mode: executed ? "action-executed" : "action-preview", citations: [], references: [] } } });
    }
    return route.abort();
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Evalúa el control «Conciliación mensual» con efectividad 2 porque la evidencia mostró varias excepciones.");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Vista previa · no se ha modificado ningún registro")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Confirmar control");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Quedó evaluado «Conciliación mensual»: inefectivo (2/5).")).toBeVisible();
  await expect(page).toHaveURL(/\/asistente$/);
});

test("Copiloto: explica prioridades y enlaza solo registros visibles", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: false, mode: "read-only" } }));
  await page.route("**/api/assistant/insights", (route) => route.fulfill({ json: {
    method: "rule-based-attention-v1", evaluated: 1, totalShown: 1, partial: false,
    insights: [{ key: "risk:RSK-1", title: "Riesgo de proveedores", reason: "Riesgo registrado con señales que requieren revisión.",
      factors: ["Nivel registrado: Alto", "Controles por revisar: 1"],
      source: { path: "/riesgos#risk-RSK-1", sourceId: "risks:RSK-1" } }]
  } }));
  await page.goto("/asistente");
  const panel = page.getByRole("region", { name: "Prioridades explicables" });
  await expect(panel.getByRole("link", { name: "Riesgo de proveedores" })).toHaveAttribute("href", "/riesgos#risk-RSK-1");
  await expect(panel.getByText(/Controles por revisar: 1/)).toBeVisible();
  await expect(panel.getByText(/no representa riesgo residual/)).toBeVisible();
});

test("Copiloto: un borrador de propuesta requiere revisión y guardado manual", async ({ page }) => {
  await useSession(page, "GERENTE", 3);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/draft-proposal", (route) => route.fulfill({ json: {
    mode: "generated", persisted: false, reviewRequired: true,
    source: { title: "Riesgo de proveedores", path: "/riesgos#risk-RSK-55" },
    draft: { title: "Auditoría de proveedores", area: "Compras", objective: "Evaluar controles de proveedores.",
      scope: "Compras y revisiones del periodo.", justification: "El riesgo registrado requiere evaluación.",
      likelihood: 3, impact: 2 }
  } }));
  let created = 0;
  await page.route("**/api/planning/auditors", (route) => route.fulfill({ json: { auditors: [] } }));
  await page.route("**/api/planning", (route) => {
    if (route.request().method() === "POST") created += 1;
    return route.fulfill({ json: { proposals: [] } });
  });
  await page.goto("/asistente?type=risk&id=RSK-55");
  await page.getByRole("button", { name: "Preparar borrador" }).click();
  const preview = page.getByRole("region", { name: "Borrador de propuesta de auditoría" });
  await expect(preview.getByText("Auditoría de proveedores")).toBeVisible();
  await expect(preview.getByRole("link", { name: /Riesgo de proveedores/ })).toHaveAttribute("href", "/riesgos#risk-RSK-55");
  await preview.getByRole("button", { name: "Usar como borrador en Planificación" }).click();
  await expect(page).toHaveURL(/\/planificacion$/);
  const form = page.locator("form.proposal-modal");
  await expect(form.getByRole("textbox", { name: "Título de la propuesta" })).toHaveValue("Auditoría de proveedores");
  await expect(form.getByText(/todavía no se ha creado ninguna propuesta/)).toBeVisible();
  expect(created).toBe(0);
});

test("Copiloto: la valoración no envía pregunta ni respuesta", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/ask", (route) => route.fulfill({ json: {
    answer: "Hay un riesgo alto en tu alcance.", mode: "computed", feedbackToken: "signed-test-token",
    citations: [], references: [], durationMs: 20
  } }));
  let sent;
  await page.route("**/api/assistant/feedback", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { recorded: true } });
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("¿Cuántos riesgos altos hay?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await page.getByRole("button", { name: "Me sirvió esta respuesta", exact: true }).click();
  await expect(page.getByText(/Tu valoración se registró sin guardar el texto/)).toBeVisible();
  expect(sent).toEqual({ feedbackToken: "signed-test-token", rating: "helpful" });
  await expect(page.getByRole("button", { name: "Me sirvió esta respuesta", exact: true })).toHaveCount(0);
});

test("Copiloto: busca evidencias visibles y muestra el fragmento y su cobertura", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/search-evidence", (route) => {
    expect(route.request().postDataJSON().question).toContain("proveedores");
    return route.fulfill({ json: { answer: "La revisión es mensual.", mode: "document-search",
      citations: [{ sourceId: "evidence:EVD-1:chunk:0", type: "Fragmento de evidencia", title: "Informe de proveedores",
        path: "/evidencias#evidence-EVD-1", excerpt: "La revisión de proveedores es mensual.", pageNumber: 2 }],
      references: [], coverage: { visibleFiles: 2, searchedFiles: 2, includedChunks: 1,
        partial: false, indexedOnly: true }, asOf: "2026-10-16T20:20:00.000Z", durationMs: 120 } });
  });
  await page.goto("/asistente");
  await expect(page.getByLabel("Buscar también en textos de evidencias visibles")).toHaveCount(0);
  await openComposerContext(page);
  await page.getByLabel("Buscar también en textos de evidencias visibles").check();
  await expect(page.locator(".assistant-context-chip").filter({ hasText: "Textos de evidencias" })).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("¿Qué dice el informe de proveedores?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("La revisión es mensual.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Página 2 · La revisión de proveedores es mensual/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Informe de proveedores/ })).toHaveAttribute("href", "/evidencias#evidence-EVD-1");
  await expect(page.getByText(/2 de 2 archivos visibles/)).toBeVisible();
});

test("Copiloto: distingue un indicador calculado de una respuesta generada", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/ask", (route) => route.fulfill({ json: {
    answer: "Riesgos altos en tu alcance: 3.", mode: "computed",
    metric: { key: "highRisks", label: "Riesgos altos", count: 3, path: "/riesgos" },
    citations: [], references: [], durationMs: 30
  } }));
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("¿Cuántos riesgos altos tengo?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Riesgos altos en tu alcance: 3.")).toBeVisible();
  await expect(page.getByText(/Dato calculado desde registros autorizados/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Riesgos altos: 3/ })).toHaveAttribute("href", "/riesgos");
  await expect(page.getByText("Sin registros citados en esta respuesta.")).toHaveCount(0);
});

test("Copiloto: briefing de auditoría muestra hechos vinculados y sugerencia citada en móvil", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/dossier/AUD-77", (route) => {
    expect(route.request().method()).toBe("POST");
    return route.fulfill({ json: {
      audit: { sourceId: "audits:AUD-77", title: "Auditoría de compras", path: "/auditorias-activas/AUD-77",
        facts: [{ label: "Estado", value: "ACTIVE" }] },
      sections: [{ key: "risks", label: "Riesgos vinculados", total: 1, shown: 1,
        items: [{ sourceId: "risks:RSK-77", title: "Riesgo de proveedores", path: "/riesgos#risk-RSK-77",
          facts: [{ label: "Nivel", value: "Alto" }] }] },
      { key: "controls", label: "Controles relacionados", total: 0, shown: 0, items: [] },
      { key: "findings", label: "Hallazgos relacionados", total: 0, shown: 0, items: [] },
      { key: "pending", label: "Pendientes para tu cuenta", total: 0, shown: 0, items: [] }],
      suggestion: { text: "Borrador: revisar el riesgo de proveedores.", citations: [
        { sourceId: "risks:RSK-77", type: "Riesgo", title: "Riesgo de proveedores", path: "/riesgos#risk-RSK-77" }
      ] }, asOf: "2026-10-16T20:20:00.000Z"
    } });
  });
  await page.goto("/asistente?type=audit&id=AUD-77");
  await page.getByRole("button", { name: "Preparar briefing" }).click();
  const briefing = page.getByRole("region", { name: "Briefing de auditoría" });
  await expect(briefing.getByText("Auditoría de compras")).toBeVisible();
  await expect(briefing.getByText("Riesgos vinculados")).toBeVisible();
  await expect(briefing.getByText("Borrador: revisar el riesgo de proveedores.")).toBeVisible();
  await expect(briefing.getByRole("link", { name: /Riesgo: Riesgo de proveedores/ })).toHaveAttribute("href", "/riesgos#risk-RSK-77");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - visualViewport.width)).toBeLessThanOrEqual(1);
});

test("Copiloto: el conteo por área abre los mismos filtros exactos en riesgos", async ({ page }, testInfo) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/ask", (route) => route.fulfill({ json: {
    answer: "Riesgos altos en el área Gestión Financiera: 2.", mode: "computed",
    metric: { key: "highRisksByArea", label: "Riesgos altos · Área: Gestión Financiera", count: 2,
      path: "/riesgos?level=Alto&area=Gesti%C3%B3n+Financiera", filter: { area: "Gestión Financiera" } },
    citations: [], references: []
  } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  let riskRequests = 0;
  await page.route("**/api/risks/**", (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("level")).toBe("Alto");
    expect(url.searchParams.get("area")).toBe("Gestión Financiera");
    riskRequests += 1;
    return route.fulfill({ json: { risks: [] } });
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("¿Cuántos riesgos altos hay en el área Gestión Financiera?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Riesgos altos en el área Gestión Financiera: 2.")).toBeVisible();
  await page.getByRole("link", { name: /Riesgos altos · Área: Gestión Financiera: 2/ }).click();
  await expect(page.getByLabel("Área exacta")).toHaveValue("Gestión Financiera");
  await expect(page.getByLabel("Nivel")).toHaveValue("Alto");
  await expect.poll(() => riskRequests).toBeGreaterThan(0);
  if (testInfo.project.name === "tablet-chromium") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - visualViewport.width)).toBeLessThanOrEqual(1);
  }
});

test("HU-34: consulta autorizada y navegación a registros relacionados", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/ask", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.question).toContain("riesgos");
    await route.fulfill({ json: { answer: "Hay un riesgo alto en tu alcance.", coverage: { partial: true },
      references: [{ type: "Riesgo", id: "RSK-01", title: "Riesgo de acceso", path: "/riesgos" }] } });
  });
  await page.goto("/asistente");
  await expect(page.getByRole("heading", { name: "Asistente de auditoría" })).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("¿Qué riesgos hay en mi alcance?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Hay un riesgo alto en tu alcance.")).toBeVisible();
  await expect(page.getByText(/muestra de expedientes visibles/)).toBeVisible();
  await page.getByText("Registros relacionados").click();
  await expect(page.getByRole("link", { name: /Riesgo: Riesgo de acceso/ })).toHaveAttribute("href", "/riesgos");
});

test("HU-34: sin configuración muestra indisponibilidad y deshabilita envío", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: false, mode: "read-only" } }));
  await page.goto("/asistente");
  await expect(page.getByText(/todavía no está habilitado/)).toBeVisible();
  await expect(page.getByLabel("Tu pregunta")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enviar pregunta" })).toBeDisabled();
});

test("HU-34: pantalla accesible y sin desbordamiento horizontal en móvil", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/asistente");
  await expect(page.getByLabel("Tu pregunta")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([]);
});

test("Copiloto: conserva el contexto de expediente y la pregunta anterior en la sesión", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  let calls = 0;
  await page.route("**/api/assistant/ask", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.focus).toEqual({ type: "risk", id: "RSK-1" });
    if (calls === 0) expect(body.history).toEqual([]);
    else expect(body.history.some((item) => item.role === "user" && item.text === "Resume este riesgo")).toBe(true);
    calls += 1;
    await route.fulfill({ json: { answer: "Respuesta con contexto.", citations: [
      { sourceId: "risks:RSK-1", type: "Riesgo", id: "RSK-1", title: "Riesgo de acceso", path: "/riesgos#risk-RSK-1",
        facts: [{ label: "Nivel", value: "Alto" }, { label: "Puntaje", value: "6" }] }
    ], references: [], asOf: "2026-10-16T20:20:00.000Z", durationMs: 1200 } });
  });
  await page.goto("/asistente?type=risk&id=RSK-1");
  await expect(page.getByText("Expediente en contexto")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("Resume este riesgo");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Registros citados")).toBeVisible();
  await expect(page.getByText("Nivel: Alto · Puntaje: 6")).toBeVisible();
  await page.getByText("Detalles de la respuesta").click();
  await expect(page.locator("time[datetime='2026-10-16T20:20:00.000Z']")).toBeVisible();
  await page.getByLabel("Tu pregunta").fill("¿Y sus controles?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect.poll(() => calls).toBe(2);
});

test("Copiloto: conserva la conversación al navegar y cerrar el panel", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/dashboard", (route) => route.fulfill({ json: {
    role: "AUDITOR", scopeLabel: "Mis auditorías", title: "Panel de auditorías", permissions: { canCreate: false, canApprove: false },
    metrics: { total: 0, pending: 0, active: 0, highRisk: 0, openFindings: 0, averageProgress: 0 },
    statusCounts: [], riskMatrix: [], pendingItems: []
  } }));
  const requests = [];
  await page.route("**/api/assistant/ask", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: { answer: `Respuesta ${requests.length}`, citations: [], references: [] } });
  });
  await page.goto("/asistente");
  await page.getByLabel("Tu pregunta").fill("Resume mis riesgos");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Respuesta 1")).toBeVisible();
  const mobileMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("button", { name: "Panel de Portafolio" }).click();
  await page.getByRole("button", { name: "Abrir asistente de IA" }).click();
  const dialog = page.getByRole("dialog", { name: "Copiloto VERA" });
  await expect(dialog.getByText("Respuesta 1")).toBeVisible();
  await dialog.getByLabel("Tu pregunta").fill("¿Y los controles relacionados?");
  await dialog.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(dialog.getByText("Respuesta 2")).toBeVisible();
  expect(requests[1].history).toEqual([
    { role: "user", text: "Resume mis riesgos" },
    { role: "assistant", text: "Respuesta 1" }
  ]);
  await dialog.getByRole("button", { name: "Cerrar asistente" }).click();
  await page.getByRole("button", { name: "Abrir asistente de IA" }).click();
  await expect(page.getByRole("dialog", { name: "Copiloto VERA" }).getByText("Respuesta 2")).toBeVisible();
  await page.getByRole("dialog", { name: "Copiloto VERA" }).getByRole("button", { name: "Cerrar asistente" }).click();
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.evaluate(() => {
    localStorage.setItem("token", "second-account-token");
    localStorage.setItem("user", JSON.stringify({ id: 4, role: "DIRECTOR", name: "Otra persona" }));
    history.pushState({}, "", "/dashboard");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: "Abrir asistente de IA" }).click();
  await expect(page.getByRole("dialog", { name: "Copiloto VERA" }).getByText("Respuesta 2")).toHaveCount(0);
});

test("Copiloto: abre un riesgo en panel contextual y lo envía como alcance", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [{
    id: "RSK-22", title: "Riesgo de acceso", description: "Accesos pendientes de revisión.",
    level: "Alto", score: 6, area: "Operaciones", ownerName: "Auditor", evaluations: [], responsePlan: ""
  }] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  await page.route("**/api/assistant/ask", (route) => {
    expect(route.request().postDataJSON().focus).toEqual({ type: "risk", id: "RSK-22" });
    return route.fulfill({ json: { answer: "Riesgo alto en revisión.", citations: [], references: [] } });
  });
  await page.goto("/riesgos");
  await page.getByRole("button", { name: "Analizar con IA" }).click();
  const dialog = page.getByRole("dialog", { name: "Copiloto VERA" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".assistant-focus span")).toHaveText("Riesgo de acceso");
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
  await dialog.getByLabel("Tu pregunta").fill("Resume este riesgo");
  await dialog.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(dialog.getByText("Riesgo alto en revisión.")).toBeVisible();
});

test("Copiloto: separa los hilos de dos riesgos", async ({ page }) => {
  await useSession(page, "AUDITOR", 5);
  await page.route("**/api/risks/**", (route) => route.fulfill({ json: { risks: [
    { id: "RSK-A", title: "Riesgo A", description: "Primer riesgo de prueba", level: "Alto", score: 6,
      area: "Operaciones", ownerName: "Auditor", evaluations: [], responsePlan: "" },
    { id: "RSK-B", title: "Riesgo B", description: "Segundo riesgo de prueba", level: "Medio", score: 4,
      area: "Operaciones", ownerName: "Auditor", evaluations: [], responsePlan: "" }
  ] } }));
  await page.route("**/api/planning", (route) => route.fulfill({ json: { proposals: [] } }));
  await page.route("**/api/assistant/status", (route) => route.fulfill({ json: { available: true, mode: "read-only" } }));
  const requests = [];
  await page.route("**/api/assistant/ask", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: { answer: `Respuesta ${body.focus.id}`, citations: [], references: [] } });
  });
  await page.goto("/riesgos");
  const buttons = page.getByRole("button", { name: "Analizar con IA" });
  await expect(buttons).toHaveCount(2);
  await buttons.first().click();
  let dialog = page.getByRole("dialog", { name: "Copiloto VERA" });
  await dialog.getByLabel("Tu pregunta").fill("Analiza el primer riesgo");
  await dialog.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(dialog.getByText("Respuesta RSK-A")).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar asistente" }).click();
  await buttons.nth(1).click();
  dialog = page.getByRole("dialog", { name: "Copiloto VERA" });
  await expect(dialog.getByText("Respuesta RSK-A")).toHaveCount(0);
  await dialog.getByLabel("Tu pregunta").fill("Analiza el segundo riesgo");
  await dialog.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(dialog.getByText("Respuesta RSK-B")).toBeVisible();
  expect(requests[1].history).toEqual([]);
  await dialog.getByRole("button", { name: "Cerrar asistente" }).click();
  await buttons.first().click();
  await expect(page.getByRole("dialog", { name: "Copiloto VERA" }).getByText("Respuesta RSK-A")).toBeVisible();
});
