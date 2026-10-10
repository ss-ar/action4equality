import type { AdminUser } from "./admin-auth";

export function canPublishPosts(request: Request, user: AdminUser, env: Env): boolean {
  const publishingHost = env.PUBLISHING_HOST?.trim().toLowerCase();
  if (
    !publishingHost
    || env.GITHUB_CONTENT_BRANCH !== "main"
    || new URL(request.url).hostname.toLowerCase() !== publishingHost
  ) {
    return false;
  }

  return Boolean(
    env.GITHUB_TOKEN
    && env.GITHUB_REPOSITORY
    && env.GITHUB_CONTENT_BRANCH
    && user.email,
  );
}
