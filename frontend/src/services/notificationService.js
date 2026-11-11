import { fetchWithOfflineFallback } from "./offlineSnapshots";

const request = async (path = "", method = "GET") => {
  const offsetMinutes = new Date().getTimezoneOffset();
  const response = await fetchWithOfflineFallback(`/api/notifications${path}?offsetMinutes=${offsetMinutes}`, {
    method, headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo cargar la bandeja.");
  return data;
};

export const getNotifications = request;
export const setNotificationRead = (id, read) => request(`/${encodeURIComponent(id)}/read`, read ? "PUT" : "DELETE");
