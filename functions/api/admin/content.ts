type ContentSummary = {
  posts: number;
  resources: number;
  pages: number;
};

type ContentManifest = {
  version: number;
  generatedAt: string;
  environment: string;
  summary: ContentSummary;
  posts: unknown[];
  resources: unknown[];
  pages: unknown[];
};

type ContentKind = "posts" | "resources" | "pages";

const MAX_MANIFEST_BYTES = 1_000_000;

class ManifestTooLargeError extends Error {}

function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManifest(value: unknown): value is ContentManifest {
  if (!isObject(value) || !isObject(value.summary)) return false;

  return value.version === 1
    && typeof value.generatedAt === "string"
    && typeof value.environment === "string"
    && typeof value.summary.posts === "number"
    && typeof value.summary.resources === "number"
    && typeof value.summary.pages === "number"
    && Array.isArray(value.posts)
    && Array.isArray(value.resources)
    && Array.isArray(value.pages);
}

function getContentKind(url: URL): ContentKind | null {
  const kind = url.searchParams.get("type");
  if (kind === null) return null;
  if (kind === "posts" || kind === "resources" || kind === "pages") return kind;
  return null;
}

async function readManifest(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Manifest response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;

    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_MANIFEST_BYTES) {
      await reader.cancel("Dashboard content manifest exceeded the size limit");
      throw new ManifestTooLargeError();
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const requestUrl = new URL(context.request.url);
  const requestedType = requestUrl.searchParams.get("type");
  const contentKind = getContentKind(requestUrl);

  if (requestedType !== null && contentKind === null) {
    return jsonError("Unknown content type", 400);
  }

  const manifestUrl = new URL("/admin/content.json", requestUrl);
  const manifestResponse = await context.env.ASSETS.fetch(manifestUrl);
  if (!manifestResponse.ok) {
    console.error(
      JSON.stringify({
        message: "dashboard content manifest unavailable",
        status: manifestResponse.status,
      }),
    );
    return jsonError("Dashboard content is temporarily unavailable", 503);
  }

  let manifest: unknown;
  try {
    manifest = await readManifest(manifestResponse);
  } catch (error) {
    if (error instanceof ManifestTooLargeError) {
      return jsonError("Dashboard content manifest is too large", 500);
    }
    return jsonError("Dashboard content manifest is invalid", 500);
  }

  if (!isManifest(manifest)) {
    return jsonError("Dashboard content manifest has an invalid structure", 500);
  }

  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (contentKind) {
    return Response.json(
      {
        generatedAt: manifest.generatedAt,
        environment: manifest.environment,
        total: manifest.summary[contentKind],
        items: manifest[contentKind],
      },
      { headers },
    );
  }

  return Response.json(manifest, { headers });
};
