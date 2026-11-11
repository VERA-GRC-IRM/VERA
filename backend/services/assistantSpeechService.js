const speechConfiguration = () => {
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  return region && /^[a-z0-9-]+$/.test(region) && key ? { region, key } : null;
};

const issueSpeechToken = async ({ fetchImpl = fetch } = {}) => {
  const config = speechConfiguration();
  if (!config) {
    const error = new Error("El dictado no está configurado en este entorno.");
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetchImpl(`https://${config.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST", headers: { "Ocp-Apim-Subscription-Key": config.key },
      signal: AbortSignal.timeout(8000), cache: "no-store"
    });
  } catch {
    const error = new Error("El servicio de voz no respondió. Intenta de nuevo.");
    error.status = 503;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? "El servicio de voz alcanzó su límite temporal. Intenta más tarde."
      : "El servicio de voz no está disponible. Intenta más tarde.");
    error.status = response.status === 429 ? 429 : 503;
    throw error;
  }
  const token = (await response.text()).trim();
  if (!token) {
    const error = new Error("El servicio de voz no devolvió una sesión válida.");
    error.status = 503;
    throw error;
  }
  return { token, region: config.region, expiresIn: 600 };
};

module.exports = { speechConfiguration, issueSpeechToken };
