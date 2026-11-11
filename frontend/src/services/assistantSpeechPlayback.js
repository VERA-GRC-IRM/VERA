export const synthesizeAssistantSpeech = async ({ token, region, text },
  { loadSdk = () => import("microsoft-cognitiveservices-speech-sdk") } = {}) => {
  if (!text?.trim() || text.length > 1800) throw new Error("La respuesta es demasiado larga para escucharla aquí.");
  const sdk = await loadSdk();
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisVoiceName = "es-MX-DaliaNeural";
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;
  // Sin salida automática: la interfaz controla reproducción, pausa y limpieza.
  const synthesizer = new sdk.SpeechSynthesizer(config, null);
  let finished = false;
  let settle;
  const result = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const finish = (audioData, error = null) => {
    if (finished) return;
    finished = true;
    try { synthesizer.close(); } catch { /* La sesión ya terminó. */ }
    if (error) settle.reject(error); else settle.resolve(audioData);
  };
  try {
    synthesizer.speakTextAsync(text, (response) => {
      if (response.reason === sdk.ResultReason.SynthesizingAudioCompleted && response.audioData?.byteLength) {
        finish(response.audioData);
      } else finish(null, new Error("No se pudo generar el audio de esta respuesta."));
    }, () => finish(null, new Error("No se pudo generar el audio de esta respuesta.")));
  } catch { finish(null, new Error("No se pudo iniciar la lectura de voz.")); }
  return { result, cancel: () => finish(null) };
};
