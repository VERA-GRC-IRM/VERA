const test = require("node:test");
const assert = require("node:assert/strict");
const { speechConfiguration, issueSpeechToken } = require("../services/assistantSpeechService");
const jwt = require("jsonwebtoken");
const { startTestServer } = require("./helpers/testServer");

process.env.JWT_SECRET ||= "assistant-speech-test-secret-32-characters";
const app = require("../server");

test("voz: la clave permanece en el servidor y solo se emite una sesión breve", async (t) => {
  const previous = { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION };
  process.env.AZURE_SPEECH_KEY = "test-only-secret-key";
  process.env.AZURE_SPEECH_REGION = "eastus2";
  t.after(() => {
    if (previous.key === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = previous.key;
    if (previous.region === undefined) delete process.env.AZURE_SPEECH_REGION;
    else process.env.AZURE_SPEECH_REGION = previous.region;
  });
  assert.equal(speechConfiguration().region, "eastus2");
  const session = await issueSpeechToken({ fetchImpl: async (url, options) => {
    assert.equal(url, "https://eastus2.api.cognitive.microsoft.com/sts/v1.0/issueToken");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Ocp-Apim-Subscription-Key"], "test-only-secret-key");
    return new Response("short-lived-token", { status: 200 });
  } });
  assert.deepEqual(session, { token: "short-lived-token", region: "eastus2", expiresIn: 600 });
  assert.equal(JSON.stringify(session).includes("test-only-secret-key"), false);
});

test("voz: sin configuración o con cuota agotada no se inventa una sesión", async (t) => {
  const previous = { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION };
  t.after(() => {
    if (previous.key === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = previous.key;
    if (previous.region === undefined) delete process.env.AZURE_SPEECH_REGION;
    else process.env.AZURE_SPEECH_REGION = previous.region;
  });
  delete process.env.AZURE_SPEECH_KEY;
  process.env.AZURE_SPEECH_REGION = "eastus2";
  await assert.rejects(() => issueSpeechToken({ fetchImpl: async () => { throw new Error("unexpected"); } }),
    (error) => error.status === 503);
  process.env.AZURE_SPEECH_KEY = "test-only-secret-key";
  await assert.rejects(() => issueSpeechToken({ fetchImpl: async () => new Response("quota", { status: 429 }) }),
    (error) => error.status === 429 && !error.message.includes("quota"));
  await assert.rejects(() => issueSpeechToken({ fetchImpl: async () => new Response("", { status: 200 }) }),
    (error) => error.status === 503);
});

test("voz: la ruta exige sesión y no ofrece el servicio sin configuración", async (t) => {
  const previous = process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = previous;
  });
  const base = await startTestServer(t, app);
  const path = `${base}/api/assistant/speech/token`;
  assert.equal((await fetch(path)).status, 401);
  const response = await fetch(path, { headers: {
    Authorization: `Bearer ${jwt.sign({ id: 5 }, process.env.JWT_SECRET)}`
  } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).token, undefined);
});
