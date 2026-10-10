function getKey(value: string | string[]): string | null {
  const key = (Array.isArray(value) ? value : [value]).join("/");
  return /^images\/\d{4}\/\d{2}\/[a-f0-9-]+\.(?:avif|gif|jpe?g|png|webp)$/.test(key) ? key : null;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
}

function headersFor(object: R2Object): Headers {
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return headers;
}

export const onRequestGet: PagesFunction<Env, "key"> = async (context) => {
  const key = getKey(context.params.key);
  if (!key) return notFound();

  const object = await context.env.MEDIA.get(key);
  if (!object) return notFound();
  return new Response(object.body, { headers: headersFor(object) });
};

export const onRequestHead: PagesFunction<Env, "key"> = async (context) => {
  const key = getKey(context.params.key);
  if (!key) return notFound();

  const object = await context.env.MEDIA.head(key);
  if (!object) return notFound();
  return new Response(null, { headers: headersFor(object) });
};
