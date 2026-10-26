#!/usr/bin/env python3
"""Small dependency-free guard for the hand-edited P1 data files."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(relative):
    path = ROOT / relative
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


profile = load("data/profile.json")
tech_map = load("data/tech-map.json")

required_profile = {
    "name", "headline", "summary", "status", "availability", "careerStartYear",
    "location", "roles", "workModes", "links", "proficiencyTiers",
    "featuredProjects", "education", "certifications",
}
missing = required_profile - profile.keys()
if missing:
    raise SystemExit("profile missing keys: " + ", ".join(sorted(missing)))

if not tech_map.get("signatures"):
    raise SystemExit("tech-map must contain at least one signature")

allowed_categories = {"backend", "data", "frontend and mobile", "payments", "testing and delivery", "AI tooling"}
for signature in tech_map["signatures"]:
    if signature.get("category") not in allowed_categories:
        raise SystemExit("unknown technology category: " + repr(signature.get("category")))
    if not all(signature.get(key) for key in ("technology", "kind", "match")):
        raise SystemExit("technology signature is incomplete: " + repr(signature))

print("ok: profile and technology map loaded")
print("  technology signatures=%d" % len(tech_map["signatures"]))
