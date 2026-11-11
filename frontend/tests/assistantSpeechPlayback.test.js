import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeAssistantSpeech } from "../src/services/assistantSpeechPlayback.js";

test("lectura: usa voz mexicana, devuelve audio controlable y cierra Azure", async () => {
  let created;
  const audioData = new Uint8Array([82, 73, 70, 70]).buffer;
  const sdk = {
    SpeechConfig: { fromAuthorizationToken: (token, region) => ({ token, region }) },
    SpeechSynthesisOutputFormat: { Riff16Khz16BitMonoPcm: "wav" },
    ResultReason: { SynthesizingAudioCompleted: "done" },
    SpeechSynthesizer: class {
      constructor(config, output) { created = { config, output, synthesizer: this }; }
      speakTextAsync(text, success) { created.text = text; queueMicrotask(() => success({ reason: "done", audioData })); }
      close() { this.closed = true; }
    }
  };
  const session = await synthesizeAssistantSpeech({ token: "temporary", region: "eastus2", text: "Respuesta autorizada" },
    { loadSdk: async () => sdk });
  assert.equal(await session.result, audioData);
  assert.equal(created.config.speechSynthesisVoiceName, "es-MX-DaliaNeural");
  assert.equal(created.config.speechSynthesisOutputFormat, "wav");
  assert.equal(created.config.token, "temporary");
  assert.equal(created.output, null);
  assert.equal(created.text, "Respuesta autorizada");
  assert.equal(created.synthesizer.closed, true);
});

test("lectura: permite cancelar y rechaza respuestas demasiado largas", async () => {
  await assert.rejects(() => synthesizeAssistantSpeech({ token: "x", region: "eastus2", text: "x".repeat(1801) },
    { loadSdk: async () => { throw new Error("No debe cargar Azure"); } }), /demasiado larga/);
  let synthesizer;
  const session = await synthesizeAssistantSpeech({ token: "x", region: "eastus2", text: "Hola" }, {
    loadSdk: async () => ({
      SpeechConfig: { fromAuthorizationToken: () => ({}) },
      SpeechSynthesisOutputFormat: { Riff16Khz16BitMonoPcm: "wav" },
      SpeechSynthesizer: class {
        constructor() { synthesizer = this; }
        speakTextAsync(_, success) { this.success = success; }
        close() { this.closed = true; }
      }
    })
  });
  session.cancel();
  assert.equal(await session.result, null);
  assert.equal(synthesizer.closed, true);
});
