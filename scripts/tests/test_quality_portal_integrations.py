"""The public portal must not present an old integration run as current."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("quality_portal", ROOT / "scripts/build-quality-portal.py")
portal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portal)
MAIN_SHA = "a" * 40
OLD_SHA = "b" * 40


class IntegrationPortalTests(unittest.TestCase):
    def render_for(self, integration_sha):
        run = {
            "id": 42,
            "head_sha": integration_sha,
            "status": "completed",
            "conclusion": "success",
            "created_at": "2026-11-12T20:00:00Z",
            "run_started_at": "2026-11-12T20:00:01Z",
            "updated_at": "2026-11-12T20:00:12Z",
            "html_url": "https://github.com/VERA-GRC-IRM/VERA/actions/runs/42",
        }

        def response(path):
            if path.endswith("/commits/main"):
                return {"sha": MAIN_SHA}
            if "microsoft-integration-proof.yml/runs" in path:
                return {"workflow_runs": [run]}
            return {"workflow_runs": []}

        with tempfile.TemporaryDirectory() as directory, \
             patch.object(portal, "request_json", side_effect=response), \
             patch.object(portal, "latest_quality_release", return_value=None):
            output = Path(directory)
            portal.render(output)
            return (output / "index.html").read_text(encoding="utf-8"), \
                json.loads((output / "status.json").read_text(encoding="utf-8"))

    def test_current_run_has_visible_evidence_and_correct_scope(self):
        html, status = self.render_for(MAIN_SHA)
        entry = next(row for row in status["workflows"]
                     if row["workflow"] == "microsoft-integration-proof.yml")
        self.assertEqual(entry["status"], "Aprobada")
        self.assertEqual(entry["duration_seconds"], 11)
        self.assertIn('id="integraciones-microsoft"', html)
        self.assertIn('id="integration-run-link"', html)
        self.assertIn("datos sintéticos", html)
        self.assertIn("Power BI Service", html)

    def test_old_run_is_marked_historical(self):
        html, status = self.render_for(OLD_SHA)
        entry = next(row for row in status["workflows"]
                     if row["workflow"] == "microsoft-integration-proof.yml")
        self.assertEqual(entry["status"], "Histórica")
        self.assertIn('id="integration-status">Histórica</span>', html)


if __name__ == "__main__":
    unittest.main()
