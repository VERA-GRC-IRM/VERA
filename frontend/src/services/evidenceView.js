const TYPES = new Set(["ALL", "RISK", "CONTROL", "AUDIT"]);

export const parseEvidenceView = (query) => {
  const params = new URLSearchParams(query);
  const type = params.get("type") || "ALL";
  return { search: (params.get("q") || "").slice(0, 120), filter: TYPES.has(type) ? type : "ALL" };
};

export const evidenceViewQuery = ({ search, filter }) => {
  const params = new URLSearchParams();
  if (search) params.set("q", search.slice(0, 120));
  if (TYPES.has(filter) && filter !== "ALL") params.set("type", filter);
  return params.toString();
};
