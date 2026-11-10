import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUALITY_REPORT = ROOT / "quality-report" / "quality-report.json"
PLAN = ROOT / "docs" / "testing" / "test-plan.md"
SUMMARY_FILE = ROOT / "quality-report" / "classroom-summary.md"
SUMMARY_JSON = ROOT / "quality-report" / "classroom-summary.json"
REPO_URL = f"https://github.com/{os.getenv('GITHUB_REPOSITORY', 'VERA-GRC-IRM/VERA')}"


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def result_label(value):
    return ("PASS" if value == "success" else "FAIL" if value == "failure"
            else "DIFERIDA" if value == "deferred" else "NO DISPONIBLE")


quality = load_json(QUALITY_REPORT)
ai_evaluation = load_json(ROOT / "quality-report" / "ai-evaluation.json") or {}
started_file = ROOT / "quality-report" / "classroom-start-ms.txt"
try:
    overall_seconds = max(0, int((time.time() * 1000 - int(started_file.read_text().strip())) / 1000))
except (FileNotFoundError, ValueError):
    overall_seconds = None

quality_tests = (quality or {}).get("metrics", {}).get("tests", {})
coverage = (quality or {}).get("metrics", {}).get("backendCoverage") or {}
coverage_minimums = (quality or {}).get("metrics", {}).get("coverageMinimums") or {}
ai_stage = next((stage for stage in (quality or {}).get("stages", [])
                 if stage.get("name") == "Regresión sintética sin red"), {})
planned_cases = sum(1 for line in PLAN.read_text(encoding="utf-8").splitlines() if line.startswith("| TC-"))

quality_duration = (quality or {}).get("durationSeconds")
codeql_init = os.getenv("CODEQL_INIT_RESULT", "unknown")
codeql_analysis = os.getenv("CODEQL_RESULT", "unknown")
codeql_status = "PASS" if codeql_init == "success" and codeql_analysis == "success" else "FAIL"
vulnerabilities = sum((quality or {}).get("metrics", {}).get("auditedVulnerabilities", []))
coverage_text = ", ".join(
    f"{coverage[key]} % {label}"
    for key, label in (("linesPercent", "líneas"), ("branchesPercent", "ramas"),
                       ("functionsPercent", "funciones"))
    if isinstance(coverage.get(key), (int, float))
) or "no disponible"
minimums_text = " / ".join(
    f"{coverage_minimums.get(key, 'n/d')} %"
    for key in ("linesPercent", "branchesPercent", "functionsPercent")
)

reports_complete = (
    os.getenv("E2E_RESULT") == "deferred"
    and
    quality_tests.get("total", 0) > 0
    and all(isinstance(coverage.get(key), (int, float))
            for key in ("linesPercent", "branchesPercent", "functionsPercent"))
    and ai_evaluation.get("total", 0) > 0
    and ai_evaluation.get("passed") == ai_evaluation.get("total")
    and ai_evaluation.get("modelCalls") == 0
    and ai_stage.get("status") == "PASS"
)
overall_status = "PASS" if reports_complete and all(
    os.getenv(key) == "success" for key in ("QUALITY_RESULT", "CODEQL_INIT_RESULT", "CODEQL_RESULT")
) else "FAIL"

rows = [
    "# VERA — Calidad automatizada (navegadores diferidos)",
    "",
    f"- **Resultado general:** {overall_status}",
    f"- **Commit:** `{os.getenv('GITHUB_COMMIT', 'no disponible')}`",
    f"- **Evento:** {os.getenv('GITHUB_EVENT', 'no disponible')}",
    f"- **Duración total observada:** {overall_seconds} s" if overall_seconds is not None else "- **Duración total:** no disponible",
    f"- **Abrir ejecución, logs y artefactos:** [{os.getenv('GITHUB_RUN_URL', 'ver Actions')}]({os.getenv('GITHUB_RUN_URL', 'https://github.com')})",
    "",
    "## Resultados ejecutados",
    "",
    "| Suite | Estado | Pruebas/casos | Duración | Resultado adicional |",
    "|---|---:|---:|---:|---|",
    f"| Backend y gates de calidad | {result_label(os.getenv('QUALITY_RESULT'))} | {quality_tests.get('passed', 'n/d')}/{quality_tests.get('total', 'n/d')} pruebas backend | {quality_duration if quality_duration is not None else 'n/d'} s | {vulnerabilities} vulnerabilidades altas/críticas |",
    f"| IA sintética sin red | {ai_stage.get('status', 'NO DISPONIBLE')} | {ai_evaluation.get('passed', 'n/d')}/{ai_evaluation.get('total', 'n/d')} escenarios | {ai_stage.get('durationSeconds', 'n/d')} s | {ai_evaluation.get('modelCalls', 'n/d')} llamadas al modelo |",
    f"| Interfaz E2E | {result_label(os.getenv('E2E_RESULT'))} | No ejecutada | n/d | [Deuda técnica #300]({REPO_URL}/issues/300); disponible como workflow manual |",
    f"| Análisis CodeQL | {codeql_status} | JavaScript/TypeScript | {os.getenv('CODEQL_DURATION_SECONDS', 'n/d')} s | Duración del análisis; puede haber alertas abiertas |",
    "",
    f"**Cobertura backend:** {coverage_text}. Piso automático (líneas/ramas/funciones): {minimums_text}. La cobertura mide código instrumentado; no valida por sí sola todos los requisitos.",
    "" if reports_complete else "**Evidencia incompleta:** falta al menos un reporte o una métrica obligatoria; la ejecución se marca FAIL.",
    "",
    "## Alcance completo y casos pendientes",
    "",
    f"La matriz trazable contiene **{planned_cases} casos** en [el plan de pruebas]({REPO_URL}/blob/main/docs/testing/test-plan.md). Este run ejecuta las pruebas automatizadas implementadas; la existencia de un caso en la matriz no lo convierte en aprobado.",
    "",
    f"- La prueba k6 de 150/250 usuarios no se dispara aquí: necesita staging aprobado, hostname permitido y credencial dedicada; consulta [el runbook de operaciones]({REPO_URL}/blob/main/docs/testing/operations-runbook.md).",
    f"- Persistencia, exportación y archivos requieren resultados de casos funcionales sobre el modo y entorno concretos; consulta [la matriz de aceptación]({REPO_URL}/blob/main/docs/hu-acceptance-audit.md).",
    "- TLS, disponibilidad mensual, backup/restore, privacidad y pruebas con hardware/lectores reales requieren evidencia del ambiente o revisión manual.",
    "- La matriz E2E de navegadores y sus verificaciones automatizadas de accesibilidad están diferidas; este PASS no las incluye. Se pueden iniciar manualmente desde el workflow conservado.",
    f"- Un análisis CodeQL aprobado puede mantener alertas abiertas; revisa [Security]({REPO_URL}/security) antes de afirmar ausencia de hallazgos.",
    "",
    "El reporte detallado de backend y los resúmenes JSON/Markdown están en el artefacto `vera-classroom-quality-*` durante 30 días. Playwright conserva artefactos solo si se inicia por separado.",
    ""
]

report = "\n".join(rows)
SUMMARY_FILE.parent.mkdir(parents=True, exist_ok=True)
SUMMARY_FILE.write_text(report, encoding="utf-8", newline="\n")
SUMMARY_JSON.write_text(
    json.dumps({
        "schemaVersion": 1,
        "status": overall_status,
        "commit": os.getenv("GITHUB_COMMIT"),
        "runId": os.getenv("GITHUB_RUN_ID"),
        "runUrl": os.getenv("GITHUB_RUN_URL"),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "durationSeconds": overall_seconds,
        "backend": {
            "status": result_label(os.getenv("QUALITY_RESULT")),
            "passed": quality_tests.get("passed"),
            "total": quality_tests.get("total"),
        },
        "aiSynthetic": {
            "status": ai_stage.get("status"),
            "passed": ai_evaluation.get("passed"),
            "total": ai_evaluation.get("total"),
            "modelCalls": ai_evaluation.get("modelCalls"),
        },
        "e2e": {
            "status": result_label(os.getenv("E2E_RESULT")),
            "passed": None,
            "failed": None,
            "flaky": None,
            "skipped": None,
        },
        "codeql": {
            "status": codeql_status,
            "durationSeconds": os.getenv("CODEQL_DURATION_SECONDS"),
        },
        "coverageBackend": coverage,
        "coverageMinimums": coverage_minimums,
        "highCriticalVulnerabilities": vulnerabilities,
        "traceability": {
            "plannedCases": planned_cases,
            "casesWithRelatedSources": (quality or {}).get("metrics", {}).get("traceability", {}).get("casesWithRelatedSources"),
            "individualProductionPassesClaimed": (quality or {}).get("metrics", {}).get("traceability", {}).get("caseLevelProductionPassesClaimed"),
        },
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)
summary_path = os.getenv("GITHUB_STEP_SUMMARY")
if summary_path:
    with open(summary_path, "a", encoding="utf-8", newline="\n") as summary:
        summary.write(report)

print("Executive report written to Markdown, JSON and the GitHub Actions Summary.")
if not reports_complete:
    raise SystemExit("Required quality evidence is incomplete.")
