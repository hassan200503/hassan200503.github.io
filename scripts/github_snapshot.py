"""Pure snapshot shaping logic; safe to exercise with recorded fixtures."""
from collections import defaultdict


def include_repository(repo):
    topics = set(repo.get("topics") or [])
    if repo.get("private") or repo.get("archived") or "portfolio-hidden" in topics:
        return False
    if repo.get("fork") and "portfolio-included" not in topics:
        return False
    return True


def normalize_repository(repo, language_bytes=None, technologies=None):
    license_info = repo.get("license") or {}
    return {
        "id": repo.get("id"),
        "name": repo.get("name"),
        "description": repo.get("description"),
        "topics": sorted(repo.get("topics") or []),
        "primaryLanguage": repo.get("language"),
        # Keep the old aliases until the browser renderer is migrated.
        "language": repo.get("language"),
        "languageBytes": language_bytes or {},
        "languages": language_bytes or {},
        "homepage": (repo.get("homepage") or "").strip() or None,
        "url": repo.get("html_url"),
        "stars": repo.get("stargazers_count", 0),
        "forks": repo.get("forks_count", 0),
        "sizeKb": repo.get("size", 0),
        "createdAt": repo.get("created_at"),
        "pushedAt": repo.get("pushed_at"),
        "archived": bool(repo.get("archived", False)),
        "defaultBranch": repo.get("default_branch") or "main",
        "license": license_info.get("spdx_id"),
        "technologies": technologies or [],
        "lastCommit": None,
    }


def build_snapshot(profile, repositories):
    repositories = sorted(repositories, key=lambda item: item.get("pushedAt") or "", reverse=True)
    language_totals = defaultdict(int)
    technology_totals = {}
    for repo in repositories:
        for language, count in (repo.get("languageBytes") or {}).items():
            language_totals[language] += count
        for technology in repo.get("technologies") or []:
            name = technology.get("technology")
            if not name:
                continue
            entry = technology_totals.setdefault(name, {
                "technology": name,
                "category": technology.get("category", "uncategorized"),
                "repoCount": 0,
                "firstUsed": repo.get("createdAt"),
                "lastUsed": repo.get("pushedAt"),
                "evidence": [],
            })
            entry["repoCount"] += 1
            entry["firstUsed"] = min(filter(None, [entry["firstUsed"], repo.get("createdAt")]), default=None)
            entry["lastUsed"] = max(filter(None, [entry["lastUsed"], repo.get("pushedAt")]), default=None)
            entry["evidence"].extend(technology.get("evidence") or [])

    return {
        "generatedAt": None,
        "source": "GitHub public API; generated during the site build",
        "user": {
            "login": profile.get("login"),
            "name": profile.get("name"),
            "bio": profile.get("bio"),
            "avatarUrl": profile.get("avatar_url"),
            "url": profile.get("html_url"),
            "followers": profile.get("followers", 0),
            "publicRepos": profile.get("public_repos", 0),
            "createdAt": profile.get("created_at"),
        },
        "totals": {
            "repos": len(repositories),
            "stars": sum(repo.get("stars", 0) for repo in repositories),
            "languageBytes": dict(sorted(language_totals.items(), key=lambda item: -item[1])),
            "lastPush": max((repo.get("pushedAt") for repo in repositories if repo.get("pushedAt")), default=None),
        },
        "technologyLedger": sorted(technology_totals.values(), key=lambda item: item["technology"].lower()),
        "repos": repositories,
    }
