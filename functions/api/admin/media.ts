import type { AdminData } from "../../_lib/admin-auth";
import { getRepositoryFile, listRepositoryFiles } from "../../_lib/github";
import { canPublishPosts } from "../../_lib/permissions";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function responseHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders() });
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function imageType(bytes: Uint8Array): { extension: string; contentType: string } | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { extension: "jpg", contentType: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: "png", contentType: "image/png" };
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { extension: "gif", contentType: "image/gif" };
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  if (
    bytes[4] === 0x66
    && bytes[5] === 0x74
    && bytes[6] === 0x79
    && bytes[7] === 0x70
    && (String.fromCharCode(...bytes.subarray(8, 12)) === "avif" || String.fromCharCode(...bytes.subarray(8, 12)) === "avis")
  ) {
    return { extension: "avif", contentType: "image/avif" };
  }
  return null;
}

export const onRequestPost: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) {
    return errorResponse("You do not have permission to upload images", 403);
  }

  const contentLength = Number(context.request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 16_384) {
    return errorResponse("Images must be 8 MB or smaller", 413);
  }

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return errorResponse("Choose an image file to upload", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("Choose an image file to upload", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return errorResponse("Images must be 8 MB or smaller", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) {
    return errorResponse("Use a JPEG, PNG, GIF, WebP, or AVIF image", 415);
  }

  const now = new Date();
  const key = `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${type.extension}`;
  await context.env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType: type.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  console.log(JSON.stringify({ message: "image uploaded", editor: context.data.user.email, key }));

  return Response.json(
    {
      media: {
        key,
        url: `/media/${key}`,
        contentType: type.contentType,
        size: file.size,
      },
    },
    { status: 201, headers: responseHeaders() },
  );
};

export const onRequestGet: PagesFunction<Env, string, AdminData> = async (context) => {
  const listed = await context.env.MEDIA.list({ prefix: "images/", limit: 100, include: ["httpMetadata"] });

  return Response.json(
    {
      items: listed.objects
        .filter((object) => /^images\/\d{4}\/\d{2}\/[a-f0-9-]+\.(?:avif|gif|jpe?g|png|webp)$/.test(object.key))
        .sort((first, second) => second.uploaded.getTime() - first.uploaded.getTime())
        .map((object) => ({
          key: object.key,
          url: `/media/${object.key}`,
          contentType: object.httpMetadata?.contentType ?? "image/*",
          size: object.size,
          uploaded: object.uploaded.toISOString(),
        })),
      truncated: listed.truncated,
    },
    { headers: responseHeaders() },
  );
};

export const onRequestDelete: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) {
    return errorResponse("You do not have permission to delete images", 403);
  }

  const key = new URL(context.request.url).searchParams.get("key") ?? "";
  if (!/^images\/\d{4}\/\d{2}\/[a-f0-9-]+\.(?:avif|gif|jpe?g|png|webp)$/.test(key)) {
    return errorResponse("Invalid image identifier", 400);
  }

  const imageUrl = `/media/${key}`;
  const entries = await listRepositoryFiles(context.env, "content/blog");
  const sources = entries
    .filter((entry) => entry.type === "file" && /^content\/blog\/[a-z0-9-]+\.md$/.test(entry.path))
    .map((entry) => entry.path)
    .concat([
      "data/homepage.yaml",
      "content/about/background.md",
      "content/about/mission-vision.md",
      "content/about/objectives.md",
      "content/about/partnerships.md",
      "content/contact.md",
    ]);
  const references = await Promise.all(sources.map(async (path) => {
    const file = await getRepositoryFile(context.env, path);
    return file.content.includes(imageUrl) ? path : null;
  }));
  const usedBy = references.filter((source): source is string => source !== null);
  if (usedBy.length > 0) {
    return errorResponse(`This image is used by ${usedBy.length === 1 ? usedBy[0] : usedBy.length + " website content records"}. Replace it before deleting.`, 409);
  }

  await context.env.MEDIA.delete(key);
  console.log(JSON.stringify({ message: "image deleted", editor: context.data.user.email, key }));
  return Response.json({ message: "Image deleted" }, { headers: responseHeaders() });
};
