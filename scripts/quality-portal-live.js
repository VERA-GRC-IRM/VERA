/* Public GitHub metadata only. Never expose a token or private artifact here. */
(() => {
  "use strict";

  const repository = "VERA-GRC-IRM/VERA";
  const apiBase = `https://api.github.com/repos/${repository}`;
  const workflowNames = [
    "quality.yml", "e2e.yml", "codeql.yml", "classroom-quality.yml",
    "ai-evaluation.yml", "preview-role-acceptance.yml",
    "production-smoke.yml", "local-supabase-rehearsal.yml",
  ];
  const coreNames = ["quality.yml", "codeql.yml"];
  const intervalMs = 5 * 60 * 1000;
  const minRefreshMs = 60 * 1000;
  const elements = {
    alert: document.getElementById("live-alert"),
    checked: document.getElementById("live-checked"),
    ciLabel: document.getElementById("ci-label"),
    ciStatus: document.getElementById("ci-status"),
    commit: document.getElementById("main-commit"),
    cards: document.getElementById("integral-cards"),
    integralNote: document.getElementById("integral-note"),
    integralLink: document.getElementById("integral-run-link"),
    trace: document.getElementById("traceability-wrap"),
    tableTitle: document.getElementById("table-title"),
  };
  let lastCheck = 0;
  let requestInFlight = false;

  async function githubJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function runUrl(run, filename) {
    const fallback = `https://github.com/${repository}/actions/workflows/${filename}`;
    const url = run && run.html_url;
    return typeof url === "string" &&
      new RegExp(`^https://github\\.com/${repository}/actions/runs/[0-9]+$`).test(url)
      ? url : fallback;
  }

  function state(run, mainSha) {
    if (!run) return ["Sin corrida reciente", "unknown"];
    if (run.head_sha !== mainSha) return ["Histórica", "old"];
    if (run.status !== "completed") return ["En curso", "pending"];
    return run.conclusion === "success"
      ? ["Aprobada", "success"] : ["Revisar fallo", "failure"];
  }

  function utcDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "No disponible" :
      new Intl.DateTimeFormat("es-MX", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      }).format(date) + " UTC";
  }

  function duration(run) {
    if (!run || run.status !== "completed") return "—";
    const start = Date.parse(run.run_started_at);
    const end = Date.parse(run.updated_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
    const seconds = Math.floor((end - start) / 1000);
    return seconds >= 60
      ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
  }

  function setAlert(message, classification) {
    elements.alert.textContent = message;
    elements.alert.className = `live-alert ${classification}`;
  }

  function hideUnverifiedMetrics(message) {
    elements.cards.hidden = true;
    elements.trace.hidden = true;
    elements.integralNote.textContent = message;
  }

  function markUnverified() {
    elements.ciLabel.textContent = "CI sin confirmar";
    elements.ciStatus.textContent = "Consultar GitHub Actions";
    elements.checked.textContent = "No disponible";
    elements.tableTitle.textContent = "Última instantánea publicada";
    hideUnverifiedMetrics("No se pudieron confirmar las cifras del informe integral con GitHub. Abra la corrida original.");
    for (const row of document.querySelectorAll("tr[data-workflow]")) {
      const badge = row.cells[1].querySelector(".pill");
      badge.textContent = row.dataset.workflow === "e2e.yml" ? "Diferida · manual" : "Sin confirmar";
      badge.className = "pill unknown";
    }
    setAlert("No se pudo consultar GitHub ahora. Los enlaces y tiempos son una instantánea publicada, no un estado vigente; abra Actions para comprobarlo.", "old");
  }

  async function latestRuns() {
    const listing = await githubJson("/actions/runs?branch=main&per_page=100");
    if (!Array.isArray(listing.workflow_runs)) throw new Error("Respuesta de corridas inválida");
    const latest = new Map();
    for (const run of listing.workflow_runs) {
      const name = typeof run.path === "string" ? run.path.split("/").pop() : "";
      if (workflowNames.includes(name) && !latest.has(name)) latest.set(name, run);
    }
    // A busy repository can have more than 100 recent runs; resolve missing rows directly.
    const missing = workflowNames.filter((name) => !latest.has(name));
    await Promise.all(missing.map(async (name) => {
      const data = await githubJson(`/actions/workflows/${name}/runs?branch=main&per_page=1`);
      if (Array.isArray(data.workflow_runs) && data.workflow_runs[0]) {
        latest.set(name, data.workflow_runs[0]);
      }
    }));
    return latest;
  }

  async function refresh(force = false) {
    if (requestInFlight || (!force && Date.now() - lastCheck < minRefreshMs)) return;
    requestInFlight = true;
    setAlert("Consultando el estado actual de GitHub…", "pending");
    try {
      const [commit, runs] = await Promise.all([
        githubJson("/commits/main"), latestRuns(),
      ]);
      const sha = commit && commit.sha;
      if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha)) {
        throw new Error("SHA de main no disponible");
      }

      let passed = 0;
      for (const row of document.querySelectorAll("tr[data-workflow]")) {
        const name = row.dataset.workflow;
        const run = runs.get(name);
        const [runLabel, runClassification] = state(run, sha);
        const [label, classification] = name === "e2e.yml"
          ? ["Diferida · manual", "old"] : [runLabel, runClassification];
        const badge = row.cells[1].querySelector(".pill");
        badge.textContent = label;
        badge.className = `pill ${classification}`;
        row.cells[2].textContent = run && /^[a-f0-9]{40}$/.test(run.head_sha)
          ? run.head_sha.slice(0, 8) : "—";
        row.cells[3].textContent = run ? utcDate(run.created_at) : "No disponible";
        row.cells[4].textContent = duration(run);
        row.cells[5].querySelector("a").href = runUrl(run, name);
        if (coreNames.includes(name) && classification === "success") passed += 1;
      }

      elements.ciLabel.textContent = "CI vigente de main";
      elements.ciStatus.textContent = `${passed} de 2 verificaciones principales aprobadas`;
      elements.commit.href = `https://github.com/${repository}/commit/${sha}`;
      elements.commit.querySelector("code").textContent = sha.slice(0, 12);
      elements.checked.textContent = new Intl.DateTimeFormat("es-MX", {
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      }).format(new Date());
      elements.tableTitle.textContent = "Corridas y tiempos consultados en GitHub";

      const integral = runs.get("classroom-quality.yml");
      elements.integralLink.href = runUrl(integral, "classroom-quality.yml");
      const reportIsCurrent = integral && state(integral, sha)[1] === "success" &&
        elements.cards.dataset.reportRunId === String(integral.id);
      if (reportIsCurrent) {
        elements.cards.hidden = false;
        elements.trace.hidden = false;
      } else {
        hideUnverifiedMetrics(integral && state(integral, sha)[1] === "success"
          ? "La corrida integral actual ya terminó; sus cifras aparecerán cuando se publique el nuevo informe. Abra su Summary mientras tanto."
          : "No hay un informe integral aprobado y publicado para el commit actual. Abra el flujo para consultar o iniciar una ejecución.");
      }

      lastCheck = Date.now();
      setAlert(`Estado consultado al abrir esta página. Navegadores diferidos. GitHub puede servir metadatos con hasta 60 segundos de caché. Commit: ${sha.slice(0, 12)}.`, passed === 2 ? "success" : "pending");
    } catch (_) {
      markUnverified();
    } finally {
      requestInFlight = false;
    }
  }

  refresh(true);
  window.setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener("focus", () => refresh());
})();
