export type RepositoryFile = {
  path: string;
  sha: string;
  content: string;
};

export type RepositoryWriteResult = {
  fileSha: string;
  commitSha: string | null;
  commitUrl: string | null;
};

export class GitHubApiError extends Error {
  readonly status: number;
  readonly code: "configuration" | "not_found" | "conflict" | "upstream";

  constructor(
    message: string,
    status: number,
    code: "configuration" | "not_found" | "conflict" | "upstream",
  ) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.code = code;
  }
}

type GitHubConfig = {
  repository: string;
  branch: string;
  token: string;
};

const API_VERSION = "2026-03-10";

function getConfig(env: Env): GitHubConfig {
  const repository = env.GITHUB_REPOSITORY;
  const branch = env.GITHUB_CONTENT_BRANCH;
  const token = env.GITHUB_TOKEN;

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !branch
    || branch.includes("..")
    || branch.startsWith("/")
    || branch.endsWith("/")
    || !token) {
    throw new GitHubApiError("GitHub publishing is not configured", 503, "configuration");
  }

  return { repository, branch, token };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function repositoryUrl(config: GitHubConfig, path: string): URL {
  const repository = config.repository.split("/").map(encodeURIComponent).join("/");
  return new URL(`https://api.github.com/repos/${repository}/contents/${encodePath(path)}`);
}

function requestHeaders(config: GitHubConfig): Headers {
  return new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "action4equality-dashboard",
    "X-GitHub-Api-Version": API_VERSION,
  });
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function githubError(response: Response, action: string): Promise<GitHubApiError> {
  if (response.status === 404) return new GitHubApiError("Post not found", 404, "not_found");
  if (response.status === 409 || response.status === 422) {
    return new GitHubApiError("The post changed before this update was published. Reload and try again.", 409, "conflict");
  }
  if (response.status === 401 || response.status === 403) {
    return new GitHubApiError("GitHub publishing credentials were rejected", 503, "configuration");
  }

  console.error(JSON.stringify({ message: `GitHub ${action} failed`, status: response.status }));
  return new GitHubApiError("GitHub is temporarily unavailable", 502, "upstream");
}

export async function getRepositoryFile(env: Env, path: string): Promise<RepositoryFile> {
  const config = getConfig(env);
  const url = repositoryUrl(config, path);
  url.searchParams.set("ref", config.branch);
  const response = await fetch(url, { headers: requestHeaders(config) });
  if (!response.ok) throw await githubError(response, "read");

  const payload: unknown = await response.json();
  if (!isRecord(payload)
    || payload.type !== "file"
    || payload.encoding !== "base64"
    || typeof payload.path !== "string"
    || typeof payload.sha !== "string"
    || typeof payload.content !== "string") {
    throw new GitHubApiError("GitHub returned an invalid file response", 502, "upstream");
  }

  return {
    path: payload.path,
    sha: payload.sha,
    content: decodeBase64(payload.content),
  };
}

export async function putRepositoryFile(
  env: Env,
  options: { path: string; content: string; message: string; sha?: string },
): Promise<RepositoryWriteResult> {
  const config = getConfig(env);
  const response = await fetch(repositoryUrl(config, options.path), {
    method: "PUT",
    headers: requestHeaders(config),
    body: JSON.stringify({
      message: options.message,
      content: encodeBase64(options.content),
      branch: config.branch,
      ...(options.sha ? { sha: options.sha } : {}),
    }),
  });
  if (!response.ok) throw await githubError(response, "write");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const fileSha = isRecord(payload) && isRecord(payload.content) && typeof payload.content.sha === "string"
    ? payload.content.sha
    : (await getRepositoryFile(env, options.path)).sha;
  const commit = isRecord(payload) && isRecord(payload.commit) ? payload.commit : null;

  return {
    fileSha,
    commitSha: commit && typeof commit.sha === "string" ? commit.sha : null,
    commitUrl: commit && typeof commit.html_url === "string" ? commit.html_url : null,
  };
}

export async function deleteRepositoryFile(
  env: Env,
  options: { path: string; sha: string; message: string },
): Promise<RepositoryWriteResult> {
  const config = getConfig(env);
  const response = await fetch(repositoryUrl(config, options.path), {
    method: "DELETE",
    headers: requestHeaders(config),
    body: JSON.stringify({ message: options.message, sha: options.sha, branch: config.branch }),
  });
  if (!response.ok) throw await githubError(response, "delete");

  const payload: unknown = await response.json();
  const commit = isRecord(payload) && isRecord(payload.commit) ? payload.commit : null;
  return {
    fileSha: options.sha,
    commitSha: commit && typeof commit.sha === "string" ? commit.sha : null,
    commitUrl: commit && typeof commit.html_url === "string" ? commit.html_url : null,
  };
}
