import { createRemoteJWKSet, errors, jwtVerify } from "jose";

export type AdminUser = {
  email: string;
  name: string | null;
};

export type AdminData = {
  user: AdminUser;
};

export class AdminAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

function normalizeTeamDomain(value: string): URL {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AdminAuthError("Admin authentication is misconfigured", 503);
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com")) {
    throw new AdminAuthError("Admin authentication is misconfigured", 503);
  }

  return new URL(url.origin);
}

function getAudiences(value: string): string[] {
  const audiences = value.split(",").map((audience) => audience.trim()).filter(Boolean);
  if (audiences.length === 0) {
    throw new AdminAuthError("Admin authentication is misconfigured", 503);
  }
  return audiences;
}

function isInvalidSessionError(error: unknown): boolean {
  if (!(error instanceof errors.JOSEError)) return false;

  return [
    "ERR_JWS_INVALID",
    "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    "ERR_JWT_CLAIM_VALIDATION_FAILED",
    "ERR_JWT_EXPIRED",
    "ERR_JWT_INVALID",
    "ERR_JWKS_NO_MATCHING_KEY",
  ].includes(error.code);
}

export async function authenticateAdmin(request: Request, env: Env): Promise<AdminUser> {
  const teamDomainValue = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
  const audienceValue = env.CLOUDFLARE_ACCESS_AUD;

  if (!teamDomainValue || !audienceValue) {
    throw new AdminAuthError("Admin authentication is not configured", 503);
  }

  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) {
    throw new AdminAuthError("Missing Cloudflare Access session", 401);
  }

  const teamDomain = normalizeTeamDomain(teamDomainValue);
  const audiences = getAudiences(audienceValue);

  try {
    const jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer: teamDomain.origin,
      audience: audiences,
    });

    if (typeof payload.email !== "string" || payload.email.length === 0) {
      throw new AdminAuthError("The Access session has no email identity", 403);
    }

    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    if (isInvalidSessionError(error)) {
      throw new AdminAuthError("Invalid or expired Cloudflare Access session", 401);
    }

    console.error(
      JSON.stringify({
        message: "Cloudflare Access verification unavailable",
        error: error instanceof Error ? error.message : "Unknown error",
        path: new URL(request.url).pathname,
      }),
    );
    throw new AdminAuthError("Admin authentication is temporarily unavailable", 503);
  }
}
