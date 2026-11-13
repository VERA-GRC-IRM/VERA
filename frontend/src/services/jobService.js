import { downloadReportFile } from "./reportDownload";

const API = "/api/jobs";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token") || ""}` });
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { ...options,
    headers: { ...headers(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "No se pudo consultar el trabajo.");
  return data;
};
export const listJobs = async () => (await request("/")).jobs;
export const enqueueReport = async (filters, format) => (await request("/report", {
  method: "POST", body: JSON.stringify({ filters, format, requestKey: crypto.randomUUID() })
})).job;
export const cancelJob = async (id) => (await request(`/${encodeURIComponent(id)}`, { method: "DELETE" })).job;
export const downloadJob = (id, format) => downloadReportFile(`${API}/${encodeURIComponent(id)}/download`,
  localStorage.getItem("token"), `vera-reporte-${id}.${format}`);
