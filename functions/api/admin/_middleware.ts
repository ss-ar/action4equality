import { AdminAuthError, authenticateAdmin, type AdminData } from "../../_lib/admin-auth";

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

export const onRequest: PagesFunction<Env, string, AdminData> = async (context) => {
  let user;

  try {
    user = await authenticateAdmin(context.request, context.env);
  } catch (error) {
    const authError = error instanceof AdminAuthError
      ? error
      : new AdminAuthError("Admin authentication failed", 500);
    return jsonError(authError.message, authError.status);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(context.request.method)) {
    const origin = context.request.headers.get("Origin");
    if (!origin || origin !== new URL(context.request.url).origin) {
      return jsonError("Same-origin request required", 403);
    }
  }

  context.data.user = user;

  try {
    return await context.next();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "admin API request failed",
        error: error instanceof Error ? error.message : "Unknown error",
        path: new URL(context.request.url).pathname,
      }),
    );
    return jsonError("Internal server error", 500);
  }
};
