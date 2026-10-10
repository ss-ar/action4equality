import type { AdminData } from "../../../_lib/admin-auth";
import { deleteRepositoryFile, getRepositoryFile, GitHubApiError, putRepositoryFile } from "../../../_lib/github";
import { isValidPostId, parsePostSource, serializePost, validatePostInput } from "../../../_lib/posts";
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

function getPostId(value: string | string[]): string | null {
  return typeof value === "string" && isValidPostId(value) ? value : null;
}

export const onRequestGet: PagesFunction<Env, "id", AdminData> = async (context) => {
  const id = getPostId(context.params.id);
  if (!id) return errorResponse("Invalid post identifier", 400);

  try {
    const file = await getRepositoryFile(context.env, `content/blog/${id}.md`);
    const parsed = parsePostSource(file.content, file.sha);
    return Response.json(
      {
        post: { id, ...parsed.post },
        branch: context.env.GITHUB_CONTENT_BRANCH,
      },
      { headers: responseHeaders() },
    );
  } catch (error) {
    if (error instanceof GitHubApiError) return errorResponse(error.message, error.status);

    console.error(
      JSON.stringify({
        message: "post read failed",
        error: error instanceof Error ? error.message : "Unknown error",
        id,
      }),
    );
    return errorResponse("The post could not be loaded", 500);
  }
};

export const onRequestPut: PagesFunction<Env, "id", AdminData> = async (context) => {
  const id = getPostId(context.params.id);
  if (!id) return errorResponse("Invalid post identifier", 400);
  if (!canPublishPosts(context.request, context.data.user, context.env)) {
    return errorResponse("You do not have permission to publish posts", 403);
  }

  try {
    const payload = await readJsonBody(context.request);
    const validation = validatePostInput(payload, { isNew: false, id });
    if (!validation.ok) {
      return errorResponse("Check the highlighted fields", 422, validation.errors);
    }

    const path = `content/blog/${id}.md`;
    const currentFile = await getRepositoryFile(context.env, path);
    if (validation.data.sha !== currentFile.sha) {
      return errorResponse("This post changed after you opened it. Reload before publishing.", 409);
    }

    const currentPost = parsePostSource(currentFile.content, currentFile.sha);
    const result = await putRepositoryFile(context.env, {
      path,
      content: serializePost(validation.data, currentPost.frontmatter),
      message: `Update post: ${validation.data.title}`,
      sha: currentFile.sha,
    });

    console.log(
      JSON.stringify({
        message: "post published",
        action: "update",
        editor: context.data.user.email,
        path,
        commitSha: result.commitSha,
      }),
    );

    return Response.json(
      {
        message: "Post committed. Cloudflare Pages is rebuilding the website.",
        post: { id, sha: result.fileSha },
        commit: { sha: result.commitSha, url: result.commitUrl },
      },
      { headers: responseHeaders() },
    );
  } catch (error) {
    if (error instanceof JsonBodyError || error instanceof GitHubApiError) {
      return errorResponse(error.message, error.status);
    }

    console.error(
      JSON.stringify({
        message: "post update failed",
        error: error instanceof Error ? error.message : "Unknown error",
        id,
      }),
    );
    return errorResponse("The post could not be published", 500);
  }
};

export const onRequestDelete: PagesFunction<Env, "id", AdminData> = async (context) => {
  const id = getPostId(context.params.id);
  if (!id) return errorResponse("Invalid post identifier", 400);
  if (!canPublishPosts(context.request, context.data.user, context.env)) return errorResponse("You do not have permission to unpublish posts", 403);
  try {
    const path = `content/blog/${id}.md`;
    const currentFile = await getRepositoryFile(context.env, path);
    const result = await deleteRepositoryFile(context.env, { path, sha: currentFile.sha, message: `Unpublish post: ${id}` });
    console.log(JSON.stringify({ message: "post unpublished", editor: context.data.user.email, path, commitSha: result.commitSha }));
    return Response.json({ message: "Post unpublished. Cloudflare Pages is rebuilding the website.", commit: { sha: result.commitSha, url: result.commitUrl } }, { headers: responseHeaders() });
  } catch (error) {
    if (error instanceof GitHubApiError) return errorResponse(error.message, error.status);
    return errorResponse("The post could not be unpublished", 500);
  }
};
