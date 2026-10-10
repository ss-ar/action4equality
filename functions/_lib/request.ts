export class JsonBodyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "JsonBodyError";
    this.status = status;
  }
}

export async function readJsonBody(request: Request, maxBytes = 300_000): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new JsonBodyError("Content-Type must be application/json", 415);
  }

  const statedLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(statedLength) && statedLength > maxBytes) {
    throw new JsonBodyError("Request body is too large", 413);
  }
  if (!request.body) {
    throw new JsonBodyError("Request body is required", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;

    totalBytes += result.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("Request body exceeded the size limit");
      throw new JsonBodyError("Request body is too large", 413);
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new JsonBodyError("Request body contains invalid JSON", 400);
  }
}
