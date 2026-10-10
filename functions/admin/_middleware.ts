import { AdminAuthError, authenticateAdmin, type AdminData } from "../_lib/admin-auth";

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(error: AdminAuthError): Response {
  return withSecurityHeaders(Response.json({ error: error.message }, { status: error.status }));
}

export const onRequest: PagesFunction<Env, string, AdminData> = async (context) => {
  try {
    context.data.user = await authenticateAdmin(context.request, context.env);
  } catch (error) {
    return errorResponse(
      error instanceof AdminAuthError
        ? error
        : new AdminAuthError("Admin authentication failed", 500),
    );
  }

  try {
    return withSecurityHeaders(await context.next());
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "admin asset request failed",
        error: error instanceof Error ? error.message : "Unknown error",
        path: new URL(context.request.url).pathname,
      }),
    );
    return errorResponse(new AdminAuthError("Internal server error", 500));
  }
};
