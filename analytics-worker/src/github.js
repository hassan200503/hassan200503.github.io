/* The one write path that touches the public site: the profile photo.
 *
 * The dashboard crops and resizes in the browser, so what arrives here is
 * already a small, square JPEG. It is committed to the site repository with
 * the GitHub Contents API and the Pages deployment is then dispatched, so the
 * published photo changes without a local checkout and without storing any
 * image data in this Worker or its database.
 */

const MAX_PHOTO_BYTES = 1_500_000;
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function looksLikeJpeg(bytes) {
  return bytes.length > JPEG_MAGIC.length && JPEG_MAGIC.every((byte, index) => bytes[index] === byte);
}

export function decodePhotoPayload(base64) {
  if (typeof base64 !== "string" || !base64) throw new Error("missing image data");
  const cleaned = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) throw new Error("image data is not base64");
  const bytes = Uint8Array.from(atob(cleaned), (char) => char.charCodeAt(0));
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error(`image is larger than ${(MAX_PHOTO_BYTES / 1e6).toFixed(1)} MB`);
  if (!looksLikeJpeg(bytes)) throw new Error("only JPEG images are accepted");
  return bytes;
}

function apiHeaders(env) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_CONTENTS_TOKEN}`,
    "user-agent": "hassan-portfolio-analytics",
    "x-github-api-version": "2022-11-28",
  };
}

export function requireGithubConfig(env) {
  if (!env.GITHUB_CONTENTS_TOKEN) throw new Error("GITHUB_CONTENTS_TOKEN is not configured");
  if (!env.GITHUB_REPO) throw new Error("GITHUB_REPO is not configured");
  return {
    repo: env.GITHUB_REPO,
    path: env.GITHUB_PHOTO_PATH || "images/profile-portrait.jpg",
  };
}

export async function readPhoto(env, fetchFn = fetch) {
  const { repo, path } = requireGithubConfig(env);
  const response = await fetchFn(`https://api.github.com/repos/${repo}/contents/${encodeURI(path)}`, {
    headers: { ...apiHeaders(env), accept: "application/vnd.github+json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`);
  const payload = await response.json();
  const base64 = String(payload.content || "").replace(/\n/g, "");
  return {
    path,
    sha: payload.sha,
    bytes: payload.size ?? 0,
    dataUrl: base64 ? `data:image/jpeg;base64,${base64}` : null,
    htmlUrl: payload.html_url,
  };
}

export async function commitPhoto(env, bytes, { message, fetchFn = fetch } = {}) {
  const { repo, path } = requireGithubConfig(env);
  const current = await fetchFn(`https://api.github.com/repos/${repo}/contents/${encodeURI(path)}`, {
    headers: apiHeaders(env),
  });
  let sha;
  if (current.status === 200) {
    sha = (await current.json()).sha;
  } else if (current.status !== 404) {
    throw new Error(`GitHub read failed: ${current.status}`);
  }

  const response = await fetchFn(`https://api.github.com/repos/${repo}/contents/${encodeURI(path)}`, {
    method: "PUT",
    headers: { ...apiHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({
      message: message || "chore: update published profile photo from the private dashboard",
      content: bytesToBase64(bytes),
      branch: "main",
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${detail.slice(0, 200)}`);
  }
  const payload = await response.json();
  return { sha: payload?.content?.sha || null, bytes: bytes.length, path };
}

/* Ask Pages to rebuild now rather than waiting for the next scheduled run, so
 * the new photo is live about a minute after the upload. */
export async function dispatchPagesRebuild(env, fetchFn = fetch) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO) return false;
  const response = await fetchFn(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "user-agent": "hassan-portfolio-analytics",
      "content-type": "application/json",
    },
    body: JSON.stringify({ event_type: "refresh-github-data" }),
  });
  return response.ok;
}
