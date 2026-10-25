const API_URL = "/api/business-context";

const request = async (options = {}) => {
  const response = await fetch(API_URL, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo consultar el mapa del negocio.");
  return data;
};

export const getBusinessContext = async () => (await request()).records;
export const createBusinessContext = async (record) =>
  (await request({ method: "POST", body: JSON.stringify(record) })).record;
