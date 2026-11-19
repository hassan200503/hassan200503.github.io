#!/usr/bin/env python3
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from github_snapshot import build_snapshot, compute_project_stats, detect_technologies, discover_screenshots, include_repository, keep_last_good_snapshot, normalize_repository  # noqa: E402


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

    def test_last_good_snapshot_survives_error_and_empty_candidate(self):
        previous = {"generatedAt": "old", "repos": [{"id": 101}]}
        self.assertIs(keep_last_good_snapshot(previous, None), previous)
        self.assertIs(keep_last_good_snapshot(previous, {"repos": []}), previous)
        candidate = {"generatedAt": "new", "repos": [{"id": 102}]}
        self.assertIs(keep_last_good_snapshot(previous, candidate), candidate)

    def test_normalization_preserves_untrusted_description_as_data(self):
        normalized = normalize_repository(self.repos[1], {})
        self.assertEqual(normalized["description"], "<img src=x onerror=alert(1)>")
        self.assertIsNone(normalized["primaryLanguage"])
        self.assertEqual(normalized["id"], 102)
        self.assertEqual(normalized["screenshots"], [])

    def test_snapshot_is_keyed_by_numeric_id_and_aggregates(self):
        normalized = [normalize_repository(self.repos[0], {"Python": 10})]
        normalized[0]["technologies"] = [{"technology": "Python", "category": "AI tooling", "evidence": [{"path": "main.py", "url": "https://github.com/hassan200503/safe-project/blob/main/main.py"}]}]
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
            ["Dockerfile", "pom.xml", "main.py"],
            {"pom.xml": "org.springframework.boot:spring-boot-starter-web"},
            signatures,
        )
        self.assertEqual([item["technology"] for item in technologies], ["Docker", "Python", "Spring Boot"])
        self.assertEqual(technologies[0]["evidence"][0]["path"], "Dockerfile")
        self.assertIn("blob/main/pom.xml", technologies[2]["evidence"][0]["url"])

    def test_project_stats_use_explicit_counting_method(self):
        stats = compute_project_stats(
            ["src/main/java/com/example/modules/rent/App.java", "src/main/java/com/example/modules/property/App.java", "src/main/resources/db/migration/V1.sql", "src/test/java/AppTest.java"],
            {},
        )
        self.assertEqual(stats["migrations"], 1)
        self.assertEqual(stats["modules"], 2)
        self.assertEqual(stats["tests"]["count"], 1)

    def test_screenshots_follow_readme_order_and_carry_alt_text(self):
        tree = ["README.md", "assets/hero.png", "docs/screenshots/two.png", "public/icon-192.png"]
        readme = "![Hero](assets/hero.png)\n<img src=\"docs/screenshots/two.png\" alt=\"Two\" />"
        shots = discover_screenshots(self.repos[0], tree, readme)
        self.assertEqual([shot["path"] for shot in shots], ["assets/hero.png", "docs/screenshots/two.png"])
        self.assertEqual([shot["alt"] for shot in shots], ["Hero", "Two"])
        self.assertEqual(
            shots[0]["url"],
            "https://raw.githubusercontent.com/hassan200503/safe-project/main/assets/hero.png",
        )

    def test_screenshots_ignore_external_missing_and_icon_references(self):
        tree = ["assets/hero.png", "assets/app-icon.png", "public/og.png"]
        readme = (
            "![shield](https://img.shields.io/badge/build-passing-green)\n"
            "![gone](assets/deleted.png)\n"
            "![rel](./assets/hero.png)\n"
            "![icon](assets/app-icon.png)\n"
            "![og](public/og.png)\n"
        )
        shots = discover_screenshots(self.repos[0], tree, readme)
        self.assertEqual([shot["path"] for shot in shots], ["assets/hero.png"])
        self.assertEqual(shots[0]["alt"], "rel")

    def test_screenshot_fallback_scans_only_convincing_candidates(self):
        tree = [
            "assets/app-icon.png",
            "assets/favicon.png",
            "assets/splash-icon.png",
            "assets/faq-section.png",
            "screenshots/features/01-landing-page.jpg",
            "docs/dashboard.png",
        ]
        shots = discover_screenshots(self.repos[0], tree, "")
        self.assertEqual(
            [shot["path"] for shot in shots],
            ["screenshots/features/01-landing-page.jpg", "docs/dashboard.png"],
        )
        self.assertEqual(shots[0]["alt"], "Landing page")

    def test_screenshots_are_capped_and_deduplicated(self):
        tree = ["screenshots/%02d.png" % index for index in range(1, 9)]
        shots = discover_screenshots(self.repos[0], tree, "", limit=3)
        self.assertEqual(len(shots), 3)
        self.assertEqual(shots[0]["path"], "screenshots/01.png")
        self.assertEqual(len({shot["path"] for shot in shots}), 3)


if __name__ == "__main__":
    unittest.main()
