import { fetchWithOfflineFallback } from "./offlineSnapshots";

export const getDashboardSummary = async ({ period = "all", year, semester, quarter } = {}) => {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (period !== "all") {
    params.set("period", period);
    params.set("year", String(year));
    if (period === "semester") params.set("semester", String(semester));
    if (period === "quarter") params.set("quarter", quarter);
  }
  const response = await fetchWithOfflineFallback(`/api/dashboard${params.size ? `?${params}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudo cargar el panel.");
  return data;
};
