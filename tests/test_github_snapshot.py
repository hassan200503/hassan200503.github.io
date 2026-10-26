#!/usr/bin/env python3
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from github_snapshot import build_snapshot, detect_technologies, include_repository, normalize_repository  # noqa: E402


class GithubSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / "tests/fixtures/github-repositories.json").open(encoding="utf-8") as handle:
            cls.repos = json.load(handle)

    def test_visibility_rules(self):
        self.assertTrue(include_repository(self.repos[0]))
        self.assertTrue(include_repository(self.repos[1]))
        self.assertFalse(include_repository(self.repos[2]))
        self.assertFalse(include_repository(self.repos[3]))
        self.assertFalse(include_repository(self.repos[4]))

    def test_normalization_preserves_untrusted_description_as_data(self):
        normalized = normalize_repository(self.repos[1], {})
        self.assertEqual(normalized["description"], "<img src=x onerror=alert(1)>")
        self.assertIsNone(normalized["primaryLanguage"])
        self.assertEqual(normalized["id"], 102)

    def test_snapshot_is_keyed_by_numeric_id_and_aggregates(self):
        normalized = [normalize_repository(self.repos[0], {"Python": 10})]
        normalized[0]["technologies"] = [{"technology": "Python", "category": "AI tooling", "evidence": []}]
        snapshot = build_snapshot({"login": "hassan200503"}, normalized)
        self.assertEqual(snapshot["repos"][0]["id"], 101)
        self.assertEqual(snapshot["totals"]["languageBytes"]["Python"], 10)
        self.assertEqual(snapshot["technologyLedger"][0]["repoCount"], 1)

    def test_technology_detection_keeps_evidence_paths(self):
        repo = self.repos[0]
        signatures = [
            {"technology": "Python", "category": "AI tooling", "kind": "language", "match": "Python"},
            {"technology": "Docker", "category": "testing and delivery", "kind": "file", "match": "Dockerfile"},
            {"technology": "Spring Boot", "category": "backend", "kind": "dependency", "match": "spring-boot"},
        ]
        technologies = detect_technologies(
            repo,
            ["Dockerfile", "pom.xml"],
            {"pom.xml": "org.springframework.boot:spring-boot-starter-web"},
            signatures,
        )
        self.assertEqual([item["technology"] for item in technologies], ["Docker", "Python", "Spring Boot"])
        self.assertEqual(technologies[0]["evidence"][0]["path"], "Dockerfile")
        self.assertIn("blob/main/pom.xml", technologies[2]["evidence"][0]["url"])


if __name__ == "__main__":
    unittest.main()
