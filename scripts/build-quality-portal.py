"""Build a public, read-only quality index from GitHub Actions metadata."""

import argparse
import html
import io
import json
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "VERA-GRC-IRM/VERA")
API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
WORKFLOWS = (
    ("Calidad de software", "quality.yml", "Backend, cobertura, lint, build y dependencias"),
    ("Navegadores y accesibilidad", "e2e.yml", "Diferida; ejecución manual conservada, fuera de los gates vigentes"),
    ("Análisis estático", "codeql.yml", "CodeQL para JavaScript y TypeScript"),
    ("Informe integral", "classroom-quality.yml", "Resumen ejecutivo, logs y artefactos"),
    ("Evaluación de IA", "ai-evaluation.yml", "Casos sintéticos; sin llamadas al modelo"),
    ("Roles en vista previa", "preview-role-acceptance.yml", "Ejecución manual contra datos demo; no prueba producción"),
    ("Smoke de producción", "production-smoke.yml", "Rutas públicas y rechazo anónimo; no prueba sesiones reales"),
    ("Supabase local", "local-supabase-rehearsal.yml", "Migraciones, RLS y restauración sintética en runner aislado; no prueba producción"),
)


def escape(value):
    return html.escape(str(value), quote=True)


def request_json(path):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "VERA-quality-portal/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    try:
        with urlopen(Request(f"{API}{path}", headers=headers), timeout=20) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        print(f"GitHub API unavailable for {path}: {type(error).__name__}")
        return None


def request_bytes(path):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "VERA-quality-portal/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    try:
        with build_opener(SafeArtifactRedirect()).open(
            Request(f"{API}{path}", headers=headers), timeout=30
        ) as response:
            payload = response.read(MAX_ARTIFACT_BYTES + 1)
            if len(payload) > MAX_ARTIFACT_BYTES:
                raise ValueError("artifact exceeds portal size limit")
            return payload
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        code = f" HTTP {error.code} at {urlsplit(error.url).hostname}" if isinstance(error, HTTPError) else ""
        print(f"GitHub artifact unavailable: {type(error).__name__}{code}")
        return None


class SafeArtifactRedirect(HTTPRedirectHandler):
    """Follow GitHub's signed artifact URL without forwarding the API token."""

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme != "https":
            raise URLError("artifact redirect must use HTTPS")
        redirected = super().redirect_request(request, fp, code, msg, headers, newurl)
        if redirected and urlsplit(request.full_url).hostname != target.hostname:
            redirected.remove_header("Authorization")
        return redirected


def valid_count(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def current_integral_report(run, main_sha):
    """Read only whitelisted aggregate metrics from the successful run's artifact."""
    if not run or run.get("status") != "completed" or run.get("conclusion") != "success":
        return None
    if run.get("head_sha") != main_sha or not valid_count(run.get("id")):
        return None
    run_id = run["id"]
    attempt = run.get("run_attempt")
    if not valid_count(attempt):
        return None
    expected_name = f"vera-classroom-quality-{run_id}-{attempt}"
    listing = request_json(f"/repos/{REPOSITORY}/actions/runs/{run_id}/artifacts?per_page=100")
    artifacts = listing.get("artifacts", []) if isinstance(listing, dict) else []
    artifact = next((item for item in artifacts
                     if item.get("name") == expected_name and not item.get("expired")), None)
    if not artifact or not valid_count(artifact.get("id")):
        return None
    payload = request_bytes(f"/repos/{REPOSITORY}/actions/artifacts/{artifact['id']}/zip")
    if payload is None:
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            member = archive.getinfo("quality-report/classroom-summary.json")
            if member.file_size > 64 * 1024:
                return None
            report = json.loads(archive.read(member))
    except (KeyError, OSError, ValueError, zipfile.BadZipFile, json.JSONDecodeError):
        return None
    if not isinstance(report, dict) or report.get("schemaVersion") != 1:
        return None
    if report.get("status") != "PASS" or report.get("commit") != main_sha:
        return None
    if report.get("runId") != str(run_id):
        return None
    backend = report.get("backend") or {}
    ai = report.get("aiSynthetic") or {}
    e2e = report.get("e2e") or {}
    coverage = report.get("coverageBackend") or {}
    traceability = report.get("traceability") or {}
    counts = (backend.get("passed"), backend.get("total"), ai.get("passed"), ai.get("total"),
              ai.get("modelCalls"), report.get("durationSeconds"),
              report.get("highCriticalVulnerabilities"), traceability.get("plannedCases"),
              traceability.get("casesWithRelatedSources"))
    if not all(valid_count(value) for value in counts):
        return None
    if e2e.get("status") != "DIFERIDA" or any(
            e2e.get(key) is not None for key in ("passed", "failed", "flaky", "skipped")):
        return None
    if any(not isinstance(coverage.get(key), (int, float)) or isinstance(coverage.get(key), bool)
           or not 0 <= coverage[key] <= 100
           for key in ("linesPercent", "branchesPercent", "functionsPercent")):
        return None
    if backend["passed"] > backend["total"] or ai["passed"] > ai["total"]:
        return None
    if traceability["casesWithRelatedSources"] > traceability["plannedCases"]:
        return None
    return report


def latest_quality_release():
    data = request_json(f"/repos/{REPOSITORY}/releases?per_page=20")
    releases = data if isinstance(data, list) else []
    return next((item for item in releases if not item.get("draft")
                 and str(item.get("tag_name", "")).startswith("quality-")
                 and str(item.get("html_url", "")).startswith(f"https://github.com/{REPOSITORY}/releases/tag/")), None)


def parse_date(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def date_label(value):
    parsed = parse_date(value)
    return parsed.astimezone(timezone.utc).strftime("%d %b %Y · %H:%M UTC") if parsed else "No disponible"


def duration_label(run):
    start = parse_date(run.get("run_started_at"))
    end = parse_date(run.get("updated_at")) if run.get("status") == "completed" else None
    if not start or not end or end < start:
        return "No disponible"
    seconds = int((end - start).total_seconds())
    return f"{seconds // 60} min {seconds % 60} s" if seconds >= 60 else f"{seconds} s"


def duration_seconds(run):
    start = parse_date(run.get("run_started_at"))
    end = parse_date(run.get("updated_at")) if run.get("status") == "completed" else None
    return int((end - start).total_seconds()) if start and end and end >= start else None


def latest_run(filename):
    data = request_json(
        f"/repos/{REPOSITORY}/actions/workflows/{filename}/runs?branch=main&per_page=1"
    )
    runs = data.get("workflow_runs", []) if isinstance(data, dict) else []
    return runs[0] if runs else None


def run_state(run, main_sha):
    if not run:
        return ("Sin corrida", "unknown")
    if run.get("head_sha") != main_sha:
        return ("Histórica", "old")
    if run.get("status") != "completed":
        return ("En curso", "pending")
    if run.get("conclusion") == "success":
        return ("Aprobada", "success")
    return ("Revisar fallo", "failure")


def render(output_dir):
    commit = request_json(f"/repos/{REPOSITORY}/commits/main")
    main_sha = commit.get("sha", "") if isinstance(commit, dict) else ""
    if not main_sha:
        raise RuntimeError("No se pudo identificar el commit actual de main; no se publicará un estado ambiguo.")

    rows = []
    records = []
    core_passed = 0
    integral_run = None
    for title, filename, scope in WORKFLOWS:
        run = latest_run(filename)
        if filename == "classroom-quality.yml":
            integral_run = run
        label, css_class = run_state(run, main_sha)
        if filename in ("quality.yml", "codeql.yml") and css_class == "success":
            core_passed += 1
        if filename == "e2e.yml":
            label, css_class = "Diferida · manual", "old"
        workflow_url = f"https://github.com/{REPOSITORY}/actions/workflows/{filename}"
        run_url = run.get("html_url", workflow_url) if run else workflow_url
        sha = run.get("head_sha", "") if run else ""
        revision = escape(sha[:8]) if sha else "—"
        records.append({
            "workflow": filename,
            "title": title,
            "status": label,
            "classification": css_class,
            "sha": sha or None,
            "run_url": run_url,
            "created_at": run.get("created_at") if run else None,
            "duration_seconds": duration_seconds(run) if run else None,
        })
        rows.append(
            f'<tr data-workflow="{escape(filename)}"><td><strong>{escape(title)}</strong><small>{escape(scope)}</small></td>'
            f'<td><span class="pill {css_class}">{escape(label)}</span></td>'
            f'<td><code>{revision}</code></td>'
            f'<td>{escape(date_label(run.get("created_at") if run else None))}</td>'
            f'<td>{escape(duration_label(run)) if run else "—"}</td>'
            f'<td><a href="{escape(run_url)}">Abrir evidencia ↗</a></td></tr>'
        )

    generated = datetime.now(timezone.utc).strftime("%d %b %Y · %H:%M UTC")
    classroom_url = f"https://github.com/{REPOSITORY}/actions/workflows/classroom-quality.yml"
    commit_url = f"https://github.com/{REPOSITORY}/commit/{main_sha}"
    status = "Dos verificaciones vigentes aprobadas" if core_passed == 2 else f"{core_passed} de 2 verificaciones vigentes aprobadas"
    report = current_integral_report(integral_run, main_sha)
    release = latest_quality_release()
    release_url = release.get("html_url") if release else f"https://github.com/{REPOSITORY}/releases"
    release_tag = release.get("tag_name") if release else "Releases"
    release_asset = next((asset.get("browser_download_url") for asset in release.get("assets", [])
                          if str(asset.get("name", "")).startswith("resumen-calidad-")
                          and str(asset.get("name", "")).endswith(".md")
                          and str(asset.get("browser_download_url", "")).startswith(
                              f"https://github.com/{REPOSITORY}/releases/download/")), None) if release else None
    run_url = integral_run.get("html_url", classroom_url) if integral_run else classroom_url

    if report:
        backend = report["backend"]
        ai = report["aiSynthetic"]
        coverage = report["coverageBackend"]
        traceability = report["traceability"]
        planned = traceability["plannedCases"]
        related = traceability["casesWithRelatedSources"]
        unrelated = planned - related
        related_width = related * 100 / planned if planned else 0
        metrics = (
            ("Pruebas de backend", f"{backend['passed']}/{backend['total']}", "Pruebas aprobadas del informe integral", run_url),
            ("Navegadores", "Diferida", "Fuera de los gates vigentes", f"https://github.com/{REPOSITORY}/issues/300"),
            ("IA sintética", f"{ai['passed']}/{ai['total']}", "Sin llamadas al modelo", run_url),
            ("Cobertura backend", f"{coverage['linesPercent']:.2f} %", f"Líneas · {coverage['branchesPercent']:.2f} % ramas · {coverage['functionsPercent']:.2f} % funciones", run_url),
            ("Duración integral", f"{report['durationSeconds'] // 60} min {report['durationSeconds'] % 60} s", "Tiempo observado en GitHub Actions", run_url),
            ("Dependencias", str(report["highCriticalVulnerabilities"]), "Vulnerabilidades npm altas o críticas", run_url),
        )
        metric_cards = "".join(
            f'<article class="kpi"><span class="kpi-label">{escape(label)}</span>'
            f'<strong>{escape(value)}</strong><span>{escape(detail)}</span>'
            f'<a href="{escape(link)}" aria-label="Ver detalle de {escape(label)}">Ver detalle ↗</a></article>'
            for label, value, detail, link in metrics
        )
        evidence_note = (
            f'Informe integral aprobado del commit <code>{escape(main_sha[:12])}</code>, sin pruebas de navegadores. '
            f'<a href="{escape(run_url)}">Abrir Summary, logs y artefactos ↗</a>'
        )
        traceability_view = (
            f'<section class="panel trace" id="traceability-panel" aria-labelledby="trace-title"><div class="section-head">'
            f'<div><div class="eyebrow dark">ALCANCE DEL PLAN</div><h2 id="trace-title">Trazabilidad de casos</h2></div>'
            f'<a href="https://github.com/{escape(REPOSITORY)}/blob/main/docs/testing/case-evidence-register.md">Abrir registro por caso ↗</a></div>'
            f'<p><strong>{planned} casos planeados</strong> · {related} con fuentes de prueba relacionadas · {unrelated} sin fuente asociada.</p>'
            f'<div class="trace-track" role="img" aria-label="{related} de {planned} casos con fuente relacionada; {unrelated} sin fuente">'
            f'<span class="trace-related" style="width:{related_width:.2f}%"></span></div>'
            f'<div class="trace-legend"><span><i class="legend-related"></i>Con fuente relacionada: {related}</span>'
            f'<span><i class="legend-open"></i>Sin fuente asociada: {unrelated}</span></div>'
            f'<p class="scope-note">Fuente relacionada significa trazabilidad, no aprobación individual. '
            f'Esta bitácora declara {traceability.get("individualProductionPassesClaimed", 0)} casos aprobados individualmente en Production.</p></section>'
        )
    else:
        metric_cards = ""
        evidence_note = (
            'No hay un informe integral aprobado y descargable del SHA actual. '
            f'<a href="{escape(classroom_url)}">Consultar o iniciar la ejecución ↗</a>'
        )
        traceability_view = (
            '<section class="panel trace" id="traceability-panel" aria-labelledby="trace-title">'
            '<h2 id="trace-title">Trazabilidad de casos</h2>'
            '<p>Las cifras de trazabilidad del SHA actual estarán disponibles cuando exista su informe integral. '
            f'<a href="https://github.com/{escape(REPOSITORY)}/blob/main/docs/testing/case-evidence-register.md">Abrir registro por caso ↗</a></p></section>'
        )

    archived_summary_link = (
        f'<a href="{escape(release_asset)}">Resumen permanente en Markdown ↗</a>' if release_asset else ""
    )
    page = f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'self'; connect-src https://api.github.com; base-uri 'none'; form-action 'none'">
  <title>VERA · Aseguramiento de calidad</title>
  <style>
    :root {{ color-scheme: light; --navy:#0b2343; --ink:#17283d; --green:#0b765f; --line:#dce5e8; --muted:#536579; --paper:#f4f7f8; }}
    * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif }}
    a {{ color:#075b85; text-underline-offset:3px }} a:focus-visible {{ outline:3px solid #1eb58d; outline-offset:3px }}
    header {{ background:linear-gradient(125deg,#081a35 0%,#14375b 72%,#0b765f 100%); color:white; padding:2.6rem max(1.2rem,calc((100vw - 1120px)/2)) 3.5rem }}
    header img {{ width:56px; height:56px; object-fit:contain; background:white; border-radius:12px; padding:7px }}
    .eyebrow {{ color:#9ee9cc; font-size:.78rem; font-weight:800; letter-spacing:.2em; text-transform:uppercase }}
    h1 {{ font-size:clamp(2rem,5vw,3.4rem); line-height:1.08; margin:.7rem 0 }} h2 {{ font-size:1.45rem; margin:0 0 1rem }}
    header p {{ max-width:750px; color:#dbe8ef }} header a {{ color:white }}
    main {{ max-width:1120px; margin:-1.6rem auto 4rem; padding:0 1.2rem }}
    .panel {{ background:white; border:1px solid var(--line); border-radius:20px; padding:1.5rem; box-shadow:0 12px 32px #0b234312; margin-bottom:1.2rem }}
    .summary {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem }} .metric {{ border-left:3px solid var(--green); padding-left:1rem }}
    .metric b {{ display:block; font-size:1.05rem }} .metric span,small {{ display:block; color:var(--muted); font-size:.87rem }}
    .section-head {{ display:flex; align-items:flex-end; justify-content:space-between; gap:1rem; flex-wrap:wrap }}
    .section-head h2 {{ margin:.3rem 0 0 }} .dark {{ color:var(--green) }}
    .evidence-note {{ margin:.5rem 0 1.2rem; color:var(--muted) }}
    .kpi-grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.8rem }}
    .kpi {{ min-height:148px; border:1px solid var(--line); border-radius:15px; padding:1rem; background:linear-gradient(160deg,#fff,#f8fbfa); display:flex; flex-direction:column }}
    .kpi-label {{ color:var(--muted); font-size:.78rem; font-weight:750; letter-spacing:.07em; text-transform:uppercase }}
    .kpi strong {{ font-size:clamp(1.55rem,3vw,2.3rem); line-height:1.12; margin:.35rem 0; color:var(--navy); font-variant-numeric:tabular-nums }}
    .kpi span:not(.kpi-label) {{ color:var(--muted); font-size:.82rem }} .kpi a {{ font-size:.8rem; font-weight:700; margin-top:auto; padding-top:.5rem }}
    .trace p {{ margin:.8rem 0 }} .trace-track {{ height:18px; border-radius:999px; background:#e8edf1; overflow:hidden }}
    .trace-related {{ display:block; height:100%; background:linear-gradient(90deg,#0b765f,#29ad85); border-radius:999px }}
    .trace-legend {{ display:flex; gap:1.2rem; flex-wrap:wrap; margin-top:.55rem; color:var(--muted); font-size:.85rem }}
    .trace-legend span {{ display:inline-flex; align-items:center; gap:.4rem }} .trace-legend i {{ display:inline-block; width:10px; height:10px; border-radius:50% }}
    .legend-related {{ background:#0b765f }} .legend-open {{ background:#d2dbe2 }} .scope-note {{ font-size:.88rem; color:var(--muted) }}
    .archive {{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; border-left:4px solid var(--green) }}
    .archive p {{ margin:.3rem 0 0; color:var(--muted) }} .archive-links {{ display:flex; flex-wrap:wrap; gap:1rem }}
    .table-wrap {{ overflow-x:auto }} table {{ width:100%; border-collapse:collapse; min-width:800px }} th,td {{ padding:.9rem .6rem; text-align:left; border-bottom:1px solid var(--line); vertical-align:top }} th {{ color:var(--muted); font-size:.78rem; text-transform:uppercase; letter-spacing:.08em }} td small {{ margin-top:.2rem }}
    .pill {{ display:inline-block; white-space:nowrap; border-radius:999px; padding:.2rem .6rem; font-size:.84rem; font-weight:700 }}
    .success {{ background:#e3f5ec; color:#086441 }} .failure {{ background:#fbe9e8; color:#a12e27 }} .pending {{ background:#e7f0fb; color:#254e82 }} .old,.unknown {{ background:#f3efe1; color:#70521b }}
    .links {{ display:flex; flex-wrap:wrap; gap:.7rem }} .links a {{ display:inline-block; border:1px solid var(--line); padding:.5rem .8rem; border-radius:9px; text-decoration:none; font-weight:650 }}
    .note {{ border-left:4px solid #c29a3b; padding-left:1rem }} footer {{ max-width:1120px; margin:2rem auto; padding:0 1.2rem; color:var(--muted); font-size:.85rem }}
    .live-alert {{ margin:0 0 1.2rem; padding:.8rem 1rem; border-radius:12px; font-size:.9rem }}
    [hidden] {{ display:none!important }}
    @media (max-width:800px) {{ .kpi-grid {{ grid-template-columns:repeat(2,minmax(0,1fr)) }} }}
    @media (max-width:700px) {{ .summary,.kpi-grid {{ grid-template-columns:1fr }} header {{ padding-top:2rem }} }}
  </style>
</head>
<body>
  <header><img src="vera-mark.svg" alt="Marca VERA"><div class="eyebrow">ASEGURAMIENTO DE CALIDAD · EVIDENCIA TRAZABLE</div>
  <h1>Calidad de software, con evidencia.</h1>
  <p>Resultados, cobertura y trazabilidad vinculados al commit que los produjo. Cada cifra lleva a su corrida; las comprobaciones del entorno real se distinguen de las pruebas automatizadas.</p></header>
  <main>
    <section class="panel summary" aria-label="Resumen de calidad">
      <div class="metric"><span id="ci-label">CI en la publicación</span><b id="ci-status">{escape(status)}</b><span>Calidad y CodeQL; navegadores diferidos</span></div>
      <div class="metric"><span>Commit observado</span><b><a id="main-commit" href="{escape(commit_url)}"><code>{escape(main_sha[:12])}</code></a></b><span>Rama main</span></div>
      <div class="metric"><span>Consulta en vivo</span><b id="live-checked">Pendiente</b><span id="publication-time">Publicación: {escape(generated)}</span></div>
    </section>
    <p class="live-alert pending" id="live-alert" role="status" aria-live="polite">Esta es la instantánea publicada. Al abrir la página se consulta GitHub para confirmar el estado actual.</p>
    <section class="panel" aria-labelledby="evidence-title"><div class="section-head">
      <div><div class="eyebrow dark">RESULTADOS DEL COMMIT</div><h2 id="evidence-title">Indicadores del informe integral</h2></div>
      <a id="integral-run-link" href="{escape(run_url)}">Examinar corrida ↗</a></div>
      <p class="evidence-note" id="integral-note">{evidence_note}</p><div class="kpi-grid" id="integral-cards" data-report-run-id="{escape(integral_run.get('id')) if report else ''}" hidden>{metric_cards}</div></section>
    <div id="traceability-wrap" hidden>{traceability_view}</div>
    <section class="panel archive" aria-label="Corte permanente de calidad"><div>
      <div class="eyebrow dark">BITÁCORA PERMANENTE</div><h2>Corte verificable</h2>
      <p>La prerelease conserva el resumen y sus límites después de la caducidad de los artefactos temporales. El corte archivado puede corresponder a un SHA anterior.</p></div>
      <div class="archive-links"><a href="{escape(release_url)}">{escape(release_tag)} ↗</a>{archived_summary_link}</div></section>
    <section class="panel"><h2 id="table-title">Corridas y tiempos publicados</h2><div class="table-wrap"><table>
      <thead><tr><th>Verificación</th><th>Estado</th><th>SHA del workflow</th><th>Fecha</th><th>Tiempo aprox.</th><th>Detalle</th></tr></thead>
      <tbody>{''.join(rows)}</tbody></table></div></section>
    <section class="panel"><h2>Rutas de evidencia</h2><div class="links">
      <a href="{escape(classroom_url)}">Informe integral y Summary ↗</a>
      <a href="https://github.com/{escape(REPOSITORY)}/blob/main/docs/testing/professor-quick-run.md">Guía de revisión ↗</a>
      <a href="https://github.com/{escape(REPOSITORY)}/blob/main/docs/testing/test-plan.md">Plan de 78 casos ↗</a>
      <a href="https://github.com/{escape(REPOSITORY)}/blob/main/docs/hu-acceptance-audit.md">Estado por HU ↗</a>
      <a href="https://github.com/{escape(REPOSITORY)}/issues/113">Puertas de producción pendientes ↗</a>
      <a href="https://github.com/{escape(REPOSITORY)}/wiki">Wiki ↗</a>
      <a href="status.md">Bitácora Markdown ↗</a>
      <a href="status.json">Datos JSON ↗</a>
    </div></section>
    <section class="panel note"><h2>Cómo interpretar el resultado</h2>
      <p>Una corrida aprobada verifica únicamente su alcance. Las pruebas de navegadores y sus comprobaciones automatizadas de accesibilidad están <a href="https://github.com/{escape(REPOSITORY)}/issues/300">diferidas</a> y no cuentan para el resultado vigente. La columna SHA identifica el código del workflow; en los controles contra Vercel no identifica por sí solo el deployment examinado. La aceptación de Preview usa cuentas demo aisladas y el smoke de Production solo rutas públicas y rechazo anónimo. La comprobación Supabase local usa una base desechable y una fila sintética; no acredita un respaldo de Production. Consulta el artefacto de cada corrida para ver destino y tiempos. Las pruebas de carga de 150/250 usuarios requieren staging autorizado.</p>
      <p>Los resultados de seguridad requieren revisar también <a href="https://github.com/{escape(REPOSITORY)}/security">Security</a>: un check CodeQL verde no significa cero alertas. Un despliegue exitoso tampoco acredita por sí solo la aceptación de cada HU.</p>
    </section>
  </main><footer>VERA · Fuente: GitHub Actions y commit de main. La consulta al abrir usa la API pública de GitHub; sus respuestas pueden tener hasta 60 s de caché. La vista no usa datos personales, secretos ni servicios de IA.</footer>
  <script src="live-status.js" defer></script>
</body></html>"""
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "index.html").write_text(page, encoding="utf-8", newline="\n")
    generated_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (output_dir / "status.json").write_text(
        json.dumps({
            "schemaVersion": 1,
            "repository": REPOSITORY,
            "branch": "main",
            "main_sha": main_sha,
            "generated_at": generated_iso,
            "core_passed": core_passed,
            "core_total": 2,
            "workflows": records,
            "integral_evidence": {
                "run_url": run_url,
                "status": "PASS" if report else "NO DISPONIBLE PARA MAIN",
                "backend": report["backend"] if report else None,
                "ai_synthetic": report["aiSynthetic"] if report else None,
                "e2e": report["e2e"] if report else None,
                "coverage_backend": report["coverageBackend"] if report else None,
                "duration_seconds": report["durationSeconds"] if report else None,
                "high_critical_vulnerabilities": report["highCriticalVulnerabilities"] if report else None,
                "traceability": report["traceability"] if report else None,
            },
            "archived_quality_cut": {"tag": release_tag, "url": release_url,
                                     "summary_markdown_url": release_asset},
            "scope": "GitHub Actions and bounded deployed checks; browser E2E deferred and excluded from current gates; workflow SHA is not necessarily target deployment SHA; not full production acceptance or zero security alerts",
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    markdown = [
        "# VERA · Bitácora automática de calidad",
        "",
        f"- Generado: {generated_iso}",
        f"- Repositorio: {REPOSITORY}",
        f"- Commit actual de main: `{main_sha}`",
        f"- CI vigente: {core_passed}/2 verificaciones principales aprobadas; navegadores diferidos",
        f"- Informe integral del SHA actual: {'PASS' if report else 'no disponible'} — {run_url}",
        f"- Corte archivado: [{release_tag}]({release_url})",
        "",
    ]
    if report:
        markdown.extend([
            f"- Backend: {report['backend']['passed']}/{report['backend']['total']} pruebas",
            "- Interfaz E2E: diferida; no ejecutada en el informe integral ([deuda #300](https://github.com/VERA-GRC-IRM/VERA/issues/300))",
            f"- IA sintética: {report['aiSynthetic']['passed']}/{report['aiSynthetic']['total']} escenarios; {report['aiSynthetic']['modelCalls']} llamadas al modelo",
            f"- Cobertura backend: {report['coverageBackend']['linesPercent']:.2f} % líneas, {report['coverageBackend']['branchesPercent']:.2f} % ramas, {report['coverageBackend']['functionsPercent']:.2f} % funciones",
            f"- Duración integral: {report['durationSeconds']} s",
            f"- Trazabilidad: {report['traceability']['casesWithRelatedSources']}/{report['traceability']['plannedCases']} casos con fuente relacionada; no indica aceptación individual en Production",
            "",
        ])
    markdown.extend([
        "| Verificación | Estado | SHA | Tiempo aprox. | Evidencia |",
        "| --- | --- | --- | --- | --- |",
    ])
    for record in records:
        sha_label = f"`{record['sha'][:8]}`" if record["sha"] else "—"
        seconds = record["duration_seconds"]
        markdown.append(
            f"| {record['title']} | {record['status']} | {sha_label} | "
            f"{seconds if seconds is not None else 'n/d'} s | [Corrida]({record['run_url']}) |"
        )
    markdown.extend([
        "",
        "El SHA indica el código del workflow; para controles desplegados, consulta el destino en su artifact. Un resultado de CI no acredita persistencia, autenticación real, ausencia de alertas de seguridad ni aceptación integral en producción.",
        "El informe integral contiene recuentos de pruebas y artefactos durante su retención.",
        "",
    ])
    (output_dir / "status.md").write_text("\n".join(markdown), encoding="utf-8", newline="\n")
    shutil.copyfile(ROOT / "frontend" / "public" / "vera-logo.svg", output_dir / "vera-mark.svg")
    shutil.copyfile(ROOT / "scripts" / "quality-portal-live.js", output_dir / "live-status.js")
    print(f"Quality portal generated for {main_sha[:12]} with {core_passed}/2 current checks; browser E2E deferred.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    render(parser.parse_args().output_dir)
