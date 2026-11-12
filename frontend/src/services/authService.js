const API_URL = "/api/auth";

export const verify2FA = async (tempToken, code) => {
  const response = await fetch(`${API_URL}/verify-2fa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempToken, code })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Código incorrecto");
  return data;
};

const parseApiResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    throw new Error(
      `El servidor devolvió una respuesta vacía (HTTP ${response.status}).`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error("[AUTH_RESPONSE_INVALID]", {
      status: response.status,
      body: text.slice(0, 500)
    });

    throw new Error(
      `El servidor devolvió una respuesta inválida (HTTP ${response.status}).`
    );
  }
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

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const error = new Error(
      data.message || "Error al iniciar sesión"
    );

    error.status = response.status;
    error.code = data.code;

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

  const data = await response.json();

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
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo preparar el doble factor.");
  return data;
};

export const finishPasswordMfaEnrollment = async (setupToken, code) => {
  const response = await fetch(`${API_URL}/2fa/enable`, {
    method: "POST",
    headers: { Authorization: `Bearer ${setupToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo activar el doble factor.");
  return data;
};

export const exchangeManagedSession = async (accessToken, privacyAccepted = false, privacyNoticeVersion) => {
  const response = await fetch(`${API_URL}/managed/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, privacyAccepted, privacyNoticeVersion })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "No se pudo verificar la identidad.");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
};
