"""Pure snapshot shaping logic; safe to exercise with recorded fixtures."""
from collections import defaultdict
from urllib.parse import quote
import re


# --- screenshot discovery -------------------------------------------------
#
# Cards show real screenshots, and they are found rather than configured: a
# repository puts a screenshot anywhere in its README and it appears on the
# site by itself. Two sources, in priority order.
#
#   1. Images the README references, in the order the README references them.
#      Authors order the images that matter by hand and that order is worth
#      keeping.
#   2. When the README has no images, a scan of the tree for files that are
#      either in a screenshot-ish directory or named like a view of the app.
#
# Both paths reject the things that are never a screenshot: app icons,
# favicons, logos, badges, social preview cards and build output.

SCREENSHOT_LIMIT = 3
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".avif")
SCREENSHOT_DIR_TOKENS = ("screenshot", "screenshots", "shots", "preview", "previews", "gallery", "walkthrough")
SCREENSHOT_NAME_TOKENS = (
    "screenshot", "screen", "shot", "hero", "home", "landing", "dashboard", "login",
    "signin", "signup", "register", "listing", "interface", "settings", "demo", "walkthrough",
)
EXCLUDED_DIR_NAMES = {"node_modules", "vendor", "dist", "build", "target", "coverage", ".next", "out", "test-results"}
EXCLUDED_NAME_TOKENS = (
    "icon", "favicon", "logo", "badge", "shield", "splash", "avatar", "sprite",
    "social-preview", "socialpreview", "opengraph", "og-image", "ogimage", "monochrome", "tray",
    "placeholder", "pattern", "thumbnail",
)
EXCLUDED_STEMS = {"og", "readme", "license", "cover"}

README_IMAGE_MD = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>\"']+)>?")
HTML_IMG_TAG = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
HTML_IMG_SRC = re.compile(r"""src\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
HTML_IMG_ALT = re.compile(r"""alt\s*=\s*["']([^"']*)["']""", re.IGNORECASE)


def _clean_path(value):
    path = (value or "").replace("\\", "/").strip()
    while path.startswith("./"):
        path = path[2:]
    return path.lstrip("/")


def _stem(path):
    return path.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()


def _directories(path):
    parts = path.lower().split("/")
    return parts[:-1]


def _is_screenshot_image(path):
    """Reject anything that is an image but is plainly not a screenshot."""
    lowered = path.lower()
    if not lowered.endswith(IMAGE_EXTENSIONS):
        return False
    for directory in _directories(path):
        if directory in EXCLUDED_DIR_NAMES:
            return False
    stem = _stem(path)
    if stem in EXCLUDED_STEMS:
        return False
    return not any(token in stem for token in EXCLUDED_NAME_TOKENS)


def _screenshot_rank(path):
    """Sort key for the fallback scan; lower sorts first."""
    directories = _directories(path)
    in_screenshot_dir = any(token in directory for directory in directories for token in SCREENSHOT_DIR_TOKENS)
    named_like_screenshot = any(token in _stem(path) for token in SCREENSHOT_NAME_TOKENS)
    if in_screenshot_dir:
        tier = 0
    elif named_like_screenshot:
        tier = 1
    else:
        tier = 2
    return (tier, path)


def _humanize(path):
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    words = [word for word in re.split(r"[-_\s]+", stem) if word and not word.isdigit()]
    text = " ".join(words).strip()
    return (text[:1].upper() + text[1:])[:80] if text else "Screenshot"


def _readme_image_refs(readme_text):
    """(alt, reference) pairs, in document order."""
    refs = []
    if not readme_text:
        return refs
    for match in README_IMAGE_MD.finditer(readme_text):
        refs.append((match.group(1).strip(), match.group(2).strip()))
    for tag in HTML_IMG_TAG.findall(readme_text):
        src = HTML_IMG_SRC.search(tag)
        if not src:
            continue
        alt = HTML_IMG_ALT.search(tag)
        refs.append((alt.group(1).strip() if alt else "", src.group(1).strip()))
    return refs


def discover_screenshots(repo, tree_paths, readme_text=None, limit=SCREENSHOT_LIMIT):
    """Find raw GitHub image URLs for a repository's screenshots.

    Only paths that actually exist in the tree are returned, so a README that
    points at a deleted image cannot put a broken picture on the site.
    """
    owner = (repo.get("owner") or {}).get("login") or repo.get("owner_login") or "hassan200503"
    name = repo.get("name") or ""
    branch = repo.get("default_branch") or "main"
    if not name:
        return []

    tree = {_clean_path(path) for path in tree_paths if path}
    chosen = []
    seen = set()

    for alt, reference in _readme_image_refs(readme_text):
        if "://" in reference or reference.startswith("//") or reference.startswith("data:"):
            continue
        reference = reference.split("?")[0].split("#")[0]
        path = _clean_path(reference)
        if not path or path in seen or path not in tree or not _is_screenshot_image(path):
            continue
        seen.add(path)
        chosen.append({"path": path, "alt": alt[:120] or _humanize(path)})
        if len(chosen) >= limit:
            break

    if not chosen:
        ranked = [_screenshot_rank(path) for path in tree if _is_screenshot_image(path)]
        # A file in a screenshot folder, or one named like a view of the app,
        # is a screenshot. Anything else is decoration and stays off the card.
        for tier, path in sorted(ranked):
            if tier > 1 or path in seen:
                continue
            seen.add(path)
            chosen.append({"path": path, "alt": _humanize(path)})
            if len(chosen) >= limit:
                break

    base = "https://raw.githubusercontent.com/%s/%s/%s/" % (owner, name, branch)
    for item in chosen:
        item["url"] = base + quote(item["path"], safe="/")
    return chosen


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
        "screenshots": [],
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
