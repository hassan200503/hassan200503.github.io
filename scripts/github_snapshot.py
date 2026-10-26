"""Pure snapshot shaping logic; safe to exercise with recorded fixtures."""
from collections import defaultdict
import re


def include_repository(repo):
    topics = set(repo.get("topics") or [])
    if repo.get("private") or repo.get("archived") or "portfolio-hidden" in topics:
        return False
    if repo.get("fork") and "portfolio-included" not in topics:
        return False
    return True


def keep_last_good_snapshot(previous, candidate):
    """Reject malformed or unexpectedly empty candidates."""
    if not isinstance(candidate, dict) or not isinstance(candidate.get("repos"), list):
        return previous
    if isinstance(previous, dict) and previous.get("repos") and not candidate["repos"]:
        return previous
    return candidate


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
        "projectStats": {"migrations": 0, "modules": 0, "tests": {"count": 0, "method": "test source files under test paths"}},
        "lastCommit": None,
    }


def compute_project_stats(tree_paths, file_contents):
    migration_count = sum(1 for path in tree_paths if "/db/migration/" in path.replace("\\", "/") and path.lower().endswith(".sql"))
    modules = set()
    for path in tree_paths:
        match = re.search(r"/modules/([^/]+)/", "/" + path.replace("\\", "/"))
        if match:
            modules.add(match.group(1))
    test_count = 0
    for path in tree_paths:
        normalized = path.replace("\\", "/")
        if "/src/test/" not in "/" + normalized and "/test/" not in "/" + normalized:
            continue
        if normalized.lower().endswith((".java", ".js", ".jsx", ".ts", ".tsx", ".py")):
            test_count += 1
    return {
        "migrations": migration_count,
        "modules": len(modules),
        "tests": {"count": test_count, "method": "test source files under test paths"},
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
            evidence = [item for item in (technology.get("evidence") or []) if item.get("path")]
            if not name or not evidence:
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
            entry["evidence"].extend(evidence)

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


def detect_technologies(repo, tree_paths, file_contents, signatures):
    """Detect configured technologies and retain the proving path/URL.

    `tree_paths` is a list of repository-relative paths. `file_contents` maps
    paths to text for only the small set of manifests/config files selected by
    the caller. GitHub text is never treated as HTML here.
    """
    detected = {}
    base_url = (repo.get("html_url") or "").rstrip("/")
    branch = repo.get("default_branch") or "main"

    def add(signature, path=None):
        technology = signature["technology"]
        entry = detected.setdefault(technology, {
            "technology": technology,
            "category": signature["category"],
            "evidence": [],
        })
        evidence = {"path": path, "url": f"{base_url}/tree/{branch}" if not path else f"{base_url}/blob/{branch}/{path}"}
        if evidence not in entry["evidence"]:
            entry["evidence"].append(evidence)

    language_names = set((repo.get("languages") or {}).keys())
    if repo.get("language"):
        language_names.add(repo["language"])
    language_suffixes = {
        "Java": (".java",), "TypeScript": (".ts", ".tsx"), "JavaScript": (".js", ".jsx"),
        "Python": (".py",), "CSS": (".css",), "HTML": (".html",), "PLpgSQL": (".sql",),
        "PowerShell": (".ps1",), "Shell": (".sh",),
    }
    for signature in signatures:
        kind = signature.get("kind")
        match = signature.get("match", "")
        if kind == "language" and match in language_names:
            candidates = [path for path in tree_paths if path.lower().endswith(language_suffixes.get(match, ())) ]
            for path in candidates[:1]:
                add(signature, path)
        elif kind == "file":
            for path in tree_paths:
                if match.lower() in path.lower():
                    add(signature, path)
        elif kind in {"dependency", "text"}:
            for path, content in file_contents.items():
                if match.lower() in content.lower():
                    add(signature, path)
    return sorted(detected.values(), key=lambda item: item["technology"].lower())
