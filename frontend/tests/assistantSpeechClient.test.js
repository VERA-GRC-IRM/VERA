import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechRecognition } from "../src/services/assistantSpeechClient.js";

const fakeSdk = (reason, text = "", onCreate = () => {}) => ({
  SpeechConfig: { fromAuthorizationToken: (token, region) => ({ token, region }) },
  AudioConfig: { fromDefaultMicrophoneInput: () => ({ source: "microphone" }) },
  ResultReason: { RecognizedSpeech: "recognized", NoMatch: "no-match" },
  SpeechRecognizer: class {
    constructor(config, audio) { onCreate(config, audio, this); }
    recognizeOnceAsync(onSuccess) { queueMicrotask(() => onSuccess({ reason, text })); }
    close() { this.closed = true; }
  }
});

test("el dictado pasa el token temporal a Azure y devuelve texto editable sin enviarlo", async () => {
  let created;
  const session = await createSpeechRecognition({ token: "short-token", region: "eastus2" }, {
    loadSdk: async () => fakeSdk("recognized", "  Revisar la auditoría  ", (config, audio, recognizer) => {
      created = { config, audio, recognizer };
    })
  });
  assert.equal(await session.result, "Revisar la auditoría");
  assert.equal(created.config.token, "short-token");
  assert.equal(created.config.region, "eastus2");
  assert.equal(created.config.speechRecognitionLanguage, "es-MX");
  assert.equal(created.audio.source, "microphone");
  assert.equal(created.recognizer.closed, true);
});

test("el silencio y la cancelación cierran el micrófono sin inventar texto", async () => {
  const silence = await createSpeechRecognition({ token: "short-token", region: "eastus2" }, {
    loadSdk: async () => fakeSdk("no-match")
  });
  assert.equal(await silence.result, "");
  let recognizer;
  const waiting = await createSpeechRecognition({ token: "short-token", region: "eastus2" }, {
    loadSdk: async () => ({ ...fakeSdk("recognized", "No debe añadirse", (_, __, instance) => {
      recognizer = instance;
    }), SpeechRecognizer: class {
      constructor() { recognizer = this; }
      recognizeOnceAsync(onSuccess) { this.onSuccess = onSuccess; }
      close() { this.closed = true; }
    } })
  });
  waiting.cancel();
  assert.equal(await waiting.result, null);
  recognizer.onSuccess({ reason: "recognized", text: "No debe añadirse" });
  assert.equal(recognizer.closed, true);
});
