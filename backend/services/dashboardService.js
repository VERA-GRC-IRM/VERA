const { PLANNING_APPROVE_ROLES, AUDIT_PROPOSAL_CREATE_ROLES } = require("../config/roles");
const { classifyRisk } = require("../config/riskRules");

const dashboardCopy = {
  SUPER_ADMIN: {
    title: "Control ejecutivo del portafolio",
    description: "Riesgos, decisiones y ejecución de todas las auditorías.",
    scopeLabel: "Portafolio completo"
  },
  DIRECTOR: {
    title: "Consulta del portafolio",
    description: "Consulta propuestas y da seguimiento a la ejecución.",
    scopeLabel: "Portafolio completo"
  },
  GERENTE: {
    title: "Seguimiento de planeación",
    description: "Revisa propuestas abiertas y el avance del plan anual.",
    scopeLabel: "Planeación"
  },
  AUDITOR: {
    title: "Mis auditorías asignadas",
    description: "Consulta tu carga, prioridades y auditorías en curso.",
    scopeLabel: "Solo mis asignaciones"
  },
  JEFATURA: {
    title: "Seguimiento del portafolio",
    description: "Propón auditorías y consulta las prioridades del portafolio.",
    scopeLabel: "Planeación y seguimiento"
  }
};

const inPeriod = (proposal, selectedPeriod) => {
  if (selectedPeriod.period === "all") return true;
  if (Number(proposal.year) !== selectedPeriod.year) return false;
  if (selectedPeriod.period === "year") return true;
  if (selectedPeriod.period === "quarter") return proposal.quarter === selectedPeriod.quarter;
  return (selectedPeriod.semester === 1 ? ["Q1", "Q2"] : ["Q3", "Q4"]).includes(proposal.quarter);
};

const getDashboardForUser = (user, proposals, findings = [], selectedPeriod = { period: "all" }) => {
  const isAuditor = user.role === "AUDITOR";
  const visibleProposals = isAuditor
    ? proposals.filter((proposal) => proposal.responsibleId === user.id && inPeriod(proposal, selectedPeriod))
    : proposals.filter((proposal) => inPeriod(proposal, selectedPeriod));
  const activeAudits = visibleProposals.filter((proposal) => proposal.status === "ACTIVE");
  const openFindings = findings.filter((finding) => ["OPEN", "PENDING_CLOSURE"].includes(finding.status));
  const executingAudits = visibleProposals.filter((proposal) => ["ACTIVE", "CLOSED"].includes(proposal.status));
  const statusCounts = ["OPEN", "APPROVED", "ACTIVE", "CLOSED", "REJECTED"].map((status) => ({
    status,
    count: visibleProposals.filter((proposal) => proposal.status === status).length
  }));
  const riskMatrix = [1, 2, 3].map((likelihood) => [1, 2, 3].map((impact) => {
    const score = likelihood * impact;
    return {
      likelihood,
      impact,
      risk: classifyRisk(score),
      count: activeAudits.filter((audit) => (audit.likelihood ?? 2) === likelihood && (audit.impact ?? 2) === impact).length
    };
  }));
  let pendingItems;
  if (PLANNING_APPROVE_ROLES.includes(user.role)) {
    pendingItems = visibleProposals.filter((proposal) => proposal.status === "OPEN");
  } else if (user.role === "AUDITOR") {
    pendingItems = visibleProposals.filter((proposal) => ["OPEN", "APPROVED", "ACTIVE"].includes(proposal.status));
  } else if (user.role === "JEFATURA") {
    pendingItems = visibleProposals.filter((proposal) => proposal.status === "OPEN" && proposal.createdBy?.id === user.id);
  } else if (AUDIT_PROPOSAL_CREATE_ROLES.includes(user.role)) {
    pendingItems = visibleProposals.filter((proposal) => proposal.status === "OPEN");
  } else {
    pendingItems = visibleProposals.filter((proposal) => proposal.status === "ACTIVE");
  }

  const heading = dashboardCopy[user.role] || dashboardCopy.JEFATURA;
  return {
    role: user.role,
    ...heading,
    selectedPeriod,
    metrics: {
      total: visibleProposals.length,
      pending: visibleProposals.filter((proposal) => proposal.status === "OPEN").length,
      active: activeAudits.length,
      openFindings: openFindings.length,
      highRisk: visibleProposals.filter((proposal) => proposal.risk === "Alto").length,
      averageProgress: executingAudits.length
        ? Math.round(executingAudits.reduce((total, proposal) => total + (proposal.progress ?? 0), 0) / executingAudits.length)
        : 0
    },
    statusCounts,
    riskMatrix,
    pendingItems: pendingItems.slice(0, 8).map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      area: proposal.area,
      status: proposal.status,
      risk: proposal.risk,
      quarter: proposal.quarter,
      year: proposal.year,
      progress: proposal.progress ?? 0
    })),
    permissions: {
      canCreate: AUDIT_PROPOSAL_CREATE_ROLES.includes(user.role),
      canApprove: PLANNING_APPROVE_ROLES.includes(user.role),
      canManageExecution: PLANNING_APPROVE_ROLES.includes(user.role)
    }
  };
};

module.exports = { getDashboardForUser };
