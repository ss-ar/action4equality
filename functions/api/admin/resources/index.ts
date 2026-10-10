import type { AdminData } from "../../../_lib/admin-auth";
import { getRepositoryFile, GitHubApiError, putRepositoryFile } from "../../../_lib/github";
import { canPublishPosts } from "../../../_lib/permissions";
import { JsonBodyError, readJsonBody } from "../../../_lib/request";
import { serializeResource, validateResourceInput } from "../../../_lib/resources";

function headers(): HeadersInit { return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }; }
function error(message: string, status: number, errors?: Record<string, string>): Response { return Response.json({ error: message, ...(errors ? { errors } : {}) }, { status, headers: headers() }); }

export const onRequestPost: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) return error("You do not have permission to publish resources", 403);
  try {
    const validation = validateResourceInput(await readJsonBody(context.request));
    if (!validation.ok) return error("Check the highlighted fields", 422, validation.errors);
    const path = `content/resources/${validation.data.slug}.md`;
    try {
      await getRepositoryFile(context.env, path);
      return error("A resource with this slug already exists", 409, { slug: "Choose a different slug" });
    } catch (cause) {
      if (!(cause instanceof GitHubApiError) || cause.code !== "not_found") throw cause;
    }
    const result = await putRepositoryFile(context.env, { path, content: serializeResource(validation.data), message: `Add resource: ${validation.data.title}` });
    console.log(JSON.stringify({ message: "resource published", editor: context.data.user.email, path, commitSha: result.commitSha }));
    return Response.json({ message: "Resource committed. Cloudflare Pages is rebuilding the website.", resource: { id: validation.data.slug, sha: result.fileSha }, commit: { sha: result.commitSha, url: result.commitUrl } }, { status: 201, headers: headers() });
  } catch (cause) {
    if (cause instanceof JsonBodyError || cause instanceof GitHubApiError) return error(cause.message, cause.status);
    console.error(JSON.stringify({ message: "resource creation failed", error: cause instanceof Error ? cause.message : "Unknown error" }));
    return error("The resource could not be published", 500);
  }
};
