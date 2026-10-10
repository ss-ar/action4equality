import type { AdminData } from "../../../_lib/admin-auth";
import { getRepositoryFile, GitHubApiError, putRepositoryFile } from "../../../_lib/github";
import { canPublishPosts } from "../../../_lib/permissions";
import { JsonBodyError, readJsonBody } from "../../../_lib/request";
import { isValidPostId } from "../../../_lib/posts";
import { parseResourceSource, serializeResource, validateResourceInput } from "../../../_lib/resources";

function headers(): HeadersInit { return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }; }
function error(message: string, status: number, errors?: Record<string, string>): Response { return Response.json({ error: message, ...(errors ? { errors } : {}) }, { status, headers: headers() }); }
function id(value: string | string[]): string | null { return typeof value === "string" && isValidPostId(value) ? value : null; }

export const onRequestGet: PagesFunction<Env, "id", AdminData> = async (context) => {
  const resourceId = id(context.params.id); if (!resourceId) return error("Invalid resource identifier", 400);
  try { const file = await getRepositoryFile(context.env, `content/resources/${resourceId}.md`); return Response.json({ resource: { id: resourceId, ...parseResourceSource(file.content, file.sha), slug: resourceId } }, { headers: headers() }); }
  catch (cause) { if (cause instanceof GitHubApiError) return error(cause.message, cause.status); return error("The resource could not be loaded", 500); }
};

export const onRequestPut: PagesFunction<Env, "id", AdminData> = async (context) => {
  const resourceId = id(context.params.id); if (!resourceId) return error("Invalid resource identifier", 400);
  if (!canPublishPosts(context.request, context.data.user, context.env)) return error("You do not have permission to publish resources", 403);
  try {
    const validation = validateResourceInput(await readJsonBody(context.request), { isNew: false, id: resourceId });
    if (!validation.ok) return error("Check the highlighted fields", 422, validation.errors);
    const path = `content/resources/${resourceId}.md`; const current = await getRepositoryFile(context.env, path);
    if (validation.data.sha !== current.sha) return error("This resource changed after you opened it. Reload before publishing.", 409);
    const result = await putRepositoryFile(context.env, { path, content: serializeResource(validation.data), message: `Update resource: ${validation.data.title}`, sha: current.sha });
    return Response.json({ message: "Resource committed. Cloudflare Pages is rebuilding the website.", resource: { id: resourceId, sha: result.fileSha }, commit: { sha: result.commitSha, url: result.commitUrl } }, { headers: headers() });
  } catch (cause) { if (cause instanceof JsonBodyError || cause instanceof GitHubApiError) return error(cause.message, cause.status); return error("The resource could not be published", 500); }
};
