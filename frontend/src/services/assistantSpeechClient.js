export const createSpeechRecognition = async ({ token, region },
  { loadSdk = () => import("microsoft-cognitiveservices-speech-sdk") } = {}) => {
  const sdk = await loadSdk();
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = "es-MX";
  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new sdk.SpeechRecognizer(config, audio);
  let finished = false;
  let settle;
  const result = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const finish = (value, error = null) => {
    if (finished) return;
    finished = true;
    try { recognizer.close(); } catch { /* La sesión ya terminó. */ }
    if (error) settle.reject(error); else settle.resolve(value);
  };
  try {
    recognizer.recognizeOnceAsync((recognized) => {
      if (recognized.reason === sdk.ResultReason.RecognizedSpeech) finish(recognized.text?.trim() || "");
      else if (recognized.reason === sdk.ResultReason.NoMatch) finish("");
      else finish(null, new Error("No se pudo transcribir la voz."));
    }, () => finish(null, new Error("No se pudo transcribir la voz.")));
  } catch { finish(null, new Error("No se pudo iniciar el micrófono.")); }
  return { result, cancel: () => finish(null) };
};
