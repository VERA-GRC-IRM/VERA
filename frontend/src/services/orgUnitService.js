export const getAvailableOrgUnits = async () => {
  const response = await fetch("/api/org-units/available", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "No se pudieron consultar los ámbitos empresariales.");
  return data.units;
};
