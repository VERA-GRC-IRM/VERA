export async function searchRecords(query, signal) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal, headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo buscar registros.");
  return data.results || [];
}
