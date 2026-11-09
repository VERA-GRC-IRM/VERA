export const displayAuditId = (id, folio) => {
  if (Number.isInteger(Number(folio)) && Number(folio) > 0) {
    return `AUD-${String(folio).padStart(3, "0")}`;
  }
  const value = String(id || "");
  if (!value.startsWith("AUD-")) return value;
  const suffix = value.slice(4);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(suffix)) return "Auditoría";
  return value;
};
