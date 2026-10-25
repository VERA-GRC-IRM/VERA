export const getAvailableOrgUnits = async () => {
  const response = await fetch("/api/org-units/available", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudieron consultar los ámbitos empresariales.");
  return data.units;
};

export const createOrgUnit = async (unit) => {
  const response = await fetch("/api/org-units", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: JSON.stringify(unit)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No se pudo registrar el ámbito empresarial.");
  return data.unit;
};
