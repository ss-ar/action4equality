import type { AdminData } from "../../_lib/admin-auth";
import { getRepositoryFile, listRepositoryFiles } from "../../_lib/github";
import { canPublishPosts } from "../../_lib/permissions";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function headers(): HeadersInit {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

export const onRequestPost: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) {
    return error("You do not have permission to upload documents", 403);
  }

  const contentLength = Number(context.request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 16_384) return error("PDFs must be 8 MB or smaller", 413);

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return error("Choose a PDF file to upload", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return error("Choose a PDF file to upload", 400);
  if (file.size > MAX_UPLOAD_BYTES) return error("PDFs must be 8 MB or smaller", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    return error("Only PDF files can be uploaded", 415);
  }

  const now = new Date();
  const key = `documents/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.pdf`;
  await context.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000, immutable" },
  });
  console.log(JSON.stringify({ message: "document uploaded", editor: context.data.user.email, key }));

  return Response.json({ document: { key, url: `/media/${key}`, size: file.size } }, { status: 201, headers: headers() });
};

export const onRequestGet: PagesFunction<Env, string, AdminData> = async (context) => {
  const listed = await context.env.MEDIA.list({ prefix: "documents/", limit: 100 });
  return Response.json({
    items: listed.objects
      .filter((object) => /^documents\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/.test(object.key))
      .sort((first, second) => second.uploaded.getTime() - first.uploaded.getTime())
      .map((object) => ({ key: object.key, url: `/media/${object.key}`, size: object.size, uploaded: object.uploaded.toISOString() })),
    truncated: listed.truncated,
  }, { headers: headers() });
};

export const onRequestDelete: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) return error("You do not have permission to delete documents", 403);
  const key = new URL(context.request.url).searchParams.get("key") ?? "";
  if (!/^documents\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/.test(key)) return error("Invalid document identifier", 400);

  const directories = await Promise.all([listRepositoryFiles(context.env, "content/blog"), listRepositoryFiles(context.env, "content/resources")]);
  const sources = directories.flat()
    .filter((entry) => entry.type === "file" && /^content\/(?:blog|resources)\/[a-z0-9-]+\.md$/.test(entry.path))
    .map((entry) => entry.path)
    .concat(["data/homepage.yaml", "content/about/background.md", "content/about/mission-vision.md", "content/about/objectives.md", "content/about/partnerships.md", "content/contact.md"]);
  const documentUrl = `/media/${key}`;
  const references = await Promise.all(sources.map(async (path) => {
    const file = await getRepositoryFile(context.env, path);
    return file.content.includes(documentUrl) ? path : null;
  }));
  const usedBy = references.filter((path): path is string => path !== null);
  if (usedBy.length > 0) return error(`This PDF is used by ${usedBy.length === 1 ? usedBy[0] : usedBy.length + " website content records"}. Replace it before deleting.`, 409);

  await context.env.MEDIA.delete(key);
  console.log(JSON.stringify({ message: "document deleted", editor: context.data.user.email, key }));
  return Response.json({ message: "Document deleted" }, { headers: headers() });
};
