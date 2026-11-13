const API_URL = "/api/auth";

const parseAuthResponse = async (response) => {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("El servicio de acceso no está disponible. Intenta de nuevo en unos minutos.");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("El servicio de acceso no está disponible. Intenta de nuevo en unos minutos.");
  }
};

export const verify2FA = async (tempToken, code) => {
  const response = await fetch(`${API_URL}/verify-2fa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempToken, code })
  });
  const data = await parseAuthResponse(response);
  if (!response.ok) throw new Error(data.message || "Código incorrecto");
  return data;
};

export const loginUser = async (username, password) => {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      password
    })
  });

  const data = await parseAuthResponse(response);

  if (!response.ok) {
    const error = new Error(data.message || "Error al iniciar sesión");
    error.status = response.status;
    throw error;
  }

  return data;
};

// HU-01: registro propio.
export const registerUser = async ({ name, email, password, privacyAccepted, privacyNoticeVersion }) => {
  const response = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, privacyAccepted, privacyNoticeVersion })
  });

  const data = await parseAuthResponse(response);

  if (!response.ok) {
    throw new Error(data.message || "No se pudo crear la cuenta.");
  }

  return data;
};

export const startPasswordMfaEnrollment = async (setupToken) => {
  const response = await fetch(`${API_URL}/2fa/setup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${setupToken}` }
  });
  const data = await parseAuthResponse(response);
  if (!response.ok) throw new Error(data.message || "No se pudo preparar el doble factor.");
  return data;
};

export const finishPasswordMfaEnrollment = async (setupToken, code) => {
  const response = await fetch(`${API_URL}/2fa/enable`, {
    method: "POST",
    headers: { Authorization: `Bearer ${setupToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const data = await parseAuthResponse(response);
  if (!response.ok) throw new Error(data.message || "No se pudo activar el doble factor.");
  return data;
};

export const exchangeManagedSession = async (accessToken, privacyAccepted = false, privacyNoticeVersion) => {
  const response = await fetch(`${API_URL}/managed/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, privacyAccepted, privacyNoticeVersion })
  });
  const data = await parseAuthResponse(response);
  if (!response.ok) {
    const error = new Error(data.message || "No se pudo verificar la identidad.");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
};
