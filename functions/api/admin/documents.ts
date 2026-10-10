import type { AdminData } from "../../_lib/admin-auth";
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

  return Response.json({ document: { key, url: `/media/${key}`, size: file.size } }, { status: 201, headers: headers() });
};
