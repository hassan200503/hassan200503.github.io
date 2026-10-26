#!/usr/bin/env python3
"""Dependency-free checks for the generated GitHub snapshot contract."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
with (ROOT / "data/github.json").open(encoding="utf-8") as handle:
    snapshot = json.load(handle)

for key in ("generatedAt", "source", "user", "totals", "technologyLedger", "repos"):
    if key not in snapshot:
        raise SystemExit("snapshot missing key: " + key)

ids = []
for repo in snapshot["repos"]:
    for key in ("id", "name", "description", "topics", "primaryLanguage", "languageBytes", "defaultBranch", "archived", "technologies", "projectStats"):
        if key not in repo:
            raise SystemExit(f"repository {repo.get('name', '<unknown>')} missing key: {key}")
    if not isinstance(repo["id"], int) or repo["id"] < 1:
        raise SystemExit("repository id must be a positive integer")
    if repo["projectStats"].get("tests", {}).get("count", -1) < 0:
        raise SystemExit("project test count must be non-negative")
    ids.append(repo["id"])

if len(ids) != len(set(ids)):
    raise SystemExit("repository ids must be unique")

print(f"ok: snapshot generatedAt={snapshot['generatedAt']} repos={len(ids)}")
