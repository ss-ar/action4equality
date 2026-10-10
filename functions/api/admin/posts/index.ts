import type { AdminData } from "../../../_lib/admin-auth";
import { getRepositoryFile, GitHubApiError, putRepositoryFile } from "../../../_lib/github";
import { serializePost, validatePostInput } from "../../../_lib/posts";
import { canPublishPosts } from "../../../_lib/permissions";
import { JsonBodyError, readJsonBody } from "../../../_lib/request";

function responseHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorResponse(message: string, status: number, errors?: Record<string, string>): Response {
  return Response.json(
    { error: message, ...(errors ? { errors } : {}) },
    { status, headers: responseHeaders() },
  );
}

export const onRequestPost: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) {
    return errorResponse("You do not have permission to publish posts", 403);
  }

  try {
    const payload = await readJsonBody(context.request);
    const validation = validatePostInput(payload, { isNew: true });
    if (!validation.ok) {
      return errorResponse("Check the highlighted fields", 422, validation.errors);
    }

    const path = `content/blog/${validation.data.slug}.md`;
    try {
      await getRepositoryFile(context.env, path);
      return errorResponse("A post with this slug already exists", 409, {
        slug: "Choose a different slug",
      });
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.code !== "not_found") throw error;
    }

    const result = await putRepositoryFile(context.env, {
      path,
      content: serializePost(validation.data),
      message: `Add post: ${validation.data.title}`,
    });

    console.log(
      JSON.stringify({
        message: "post published",
        action: "create",
        editor: context.data.user.email,
        path,
        commitSha: result.commitSha,
      }),
    );

    return Response.json(
      {
        message: "Post committed. Cloudflare Pages is rebuilding the website.",
        post: { id: validation.data.slug, sha: result.fileSha },
        commit: { sha: result.commitSha, url: result.commitUrl },
      },
      { status: 201, headers: responseHeaders() },
    );
  } catch (error) {
    if (error instanceof JsonBodyError || error instanceof GitHubApiError) {
      return errorResponse(error.message, error.status);
    }

    console.error(
      JSON.stringify({
        message: "post creation failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return errorResponse("The post could not be published", 500);
  }
};
