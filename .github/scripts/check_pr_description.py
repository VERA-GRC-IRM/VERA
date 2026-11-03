"""Check that a human PR contains reviewable evidence, without calling an LLM."""

import json
import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


REQUIRED = {
    "alcance": 25,
    "evidencia y decisiones": 25,
    "verificación ejecutada": 25,
    "riesgos y pendientes": 15,
}
HEADINGS = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
COMMENTS = re.compile(r"<!--.*?-->", re.DOTALL)


def sections_of(body):
    matches = list(HEADINGS.finditer(body))
    return {
        match.group(1).strip().casefold(): body[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(body)]
        for index, match in enumerate(matches)
    }


def meaningful_text(text):
    without_comments = COMMENTS.sub("", text)
    return re.sub(r"[|`*_#\-\[\]()<>\s]", "", without_comments)


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        raise RuntimeError("GITHUB_EVENT_PATH no está disponible")
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    pr = event.get("pull_request") or {}
    user = pr.get("user") or {}
    summary = []

    assignees = pr.get("assignees") or []
    has_copilot_assignee = any(str(assignee.get("login", "")).casefold() == "copilot" for assignee in assignees)

    if user.get("type") == "Bot" or str(user.get("login", "")).endswith("[bot]"):
        summary.append("PR automatizado: plantilla humana no exigida; los demás checks siguen activos.")
    elif has_copilot_assignee:
        summary.append("PR asistido por Copilot: revisión documental manual permitida; los demás checks siguen activos.")
    elif pr.get("draft"):
        summary.append("Borrador: la plantilla se verificará al marcar el PR listo para revisión.")
    else:
        body = pr.get("body") or ""
        sections = sections_of(body)
        problems = []
        for heading, minimum in REQUIRED.items():
            content = sections.get(heading, "")
            if len(meaningful_text(content)) < minimum:
                problems.append(f"Completa **{heading}** con información concreta.")

        verification = COMMENTS.sub("", sections.get("verificación ejecutada", ""))
        table_rows = [line for line in verification.splitlines() if line.strip().startswith("|")]
        evidence_rows = [
            line for line in table_rows[2:]
            if len(meaningful_text(line)) >= 15 and not re.fullmatch(r"[\s|:\-]+", line)
        ]
        if not evidence_rows:
            problems.append("Agrega al menos una fila de verificación real, fallida o pendiente con su entorno y duración.")

        if problems:
            summary = ["La descripción del PR aún no permite una revisión completa:", *[f"- {item}" for item in problems]]
        else:
            summary = ["Descripción revisable: cuatro secciones completas y al menos una comprobación documentada."]

    report = "# Contrato documental del PR\n\n" + "\n".join(summary) + "\n"
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a", encoding="utf-8", newline="\n") as output:
            output.write(report)
    print(report)
    return 1 if any(line.startswith("- ") for line in summary) else 0


if __name__ == "__main__":
    sys.exit(main())
