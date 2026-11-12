export const downloadReportFile = async (url, token, filename, {
  signal, fetchImpl = fetch, documentObject = document, urlObject = URL
} = {}) => {
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo descargar el reporte.");
  }
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException("Descarga cancelada.", "AbortError");
  const objectUrl = urlObject.createObjectURL(blob);
  const link = documentObject.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  documentObject.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); urlObject.revokeObjectURL(objectUrl); }
};
