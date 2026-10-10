# Dashboard development

The dashboard is served from `/admin/` and its API is served from
`/api/admin/`. Both paths must be protected by the same Cloudflare Access
application before the dashboard is enabled for staff.

## Local commands

- `npm run build` builds Tailwind and Hugo into `public/`.
- `npm run pages:dev` builds the site and runs Pages Functions locally.
- `npm run cf:types` regenerates `functions/types.d.ts` from `wrangler.jsonc`.
- `npm run typecheck` checks the Pages Functions TypeScript.

Cloudflare Pages uses the `HUGO_VERSION` value in `wrangler.jsonc`; it is pinned
to the locally tested Hugo version so Git builds do not rely on the Pages image
default.

`npm run dev` provides a local UI preview at `http://localhost:1313/admin/`.
On localhost only, the browser reads the generated manifest directly so the
content lists can be reviewed without an Access token. This does not enable any
API authentication, publishing, or uploads. `npm run pages:dev` continues to
fail closed unless a real Access assertion reaches the local runtime.

Create an untracked `.dev.vars` file for local Pages Functions development:

```dotenv
CLOUDFLARE_ACCESS_TEAM_DOMAIN="https://your-team.cloudflareaccess.com"
CLOUDFLARE_ACCESS_AUD="your-access-application-audience-tag"
GITHUB_TOKEN="your-fine-grained-github-token"
```

Real Access JWT validation requires a request that has passed through the
configured Cloudflare Access application. There is intentionally no local
authentication bypass.

## Cloudflare Access setup

1. In Cloudflare Zero Trust, add the One-Time PIN identity provider.
2. Create a self-hosted Access application containing all four custom-domain
   paths: `action4equality.org/admin`, `action4equality.org/admin/*`,
   `action4equality.org/api/admin`, and `action4equality.org/api/admin/*`.
   Exact paths are included because `/admin/*` does not cover `/admin` itself.
3. In the Pages project, enable the preview deployment Access policy under
   **Settings > General**. Preview deployments are public by default.
4. Protect the production `action4equality.pages.dev` hostname as described in
   Cloudflare Pages known issues, or redirect that hostname to the custom
   domain. The in-application middleware also rejects requests without Access.
5. Add an Allow policy containing only approved staff email addresses.
6. Set `CLOUDFLARE_ACCESS_TEAM_DOMAIN` in Pages Variables and Secrets to the
   full team URL, such as `https://aef.cloudflareaccess.com`.
7. Set `CLOUDFLARE_ACCESS_AUD` to the Access application's audience tag. If
   the custom domain, production Pages hostname, and preview policy use
   different applications, provide their audience tags as a comma-separated
   list.
8. Redeploy the Pages project after adding the variables.

The dashboard assets and API both validate the `Cf-Access-Jwt-Assertion` header
against Cloudflare's remote signing keys. Access protection at the route is not
treated as the only authentication check. This also makes an accidentally
unprotected Pages hostname fail closed instead of exposing the dashboard.

## Current stage boundaries

- The dashboard shell and secure session endpoint are implemented.
- Hugo generates `/admin/content.json` from the exact branch being deployed.
- `/api/admin/content` returns that manifest only after Access authentication.
- Posts, resources, and key-page lists are loaded from the deployed manifest.
- Authorized editors can create and update posts through validated GitHub
  commits once `GITHUB_TOKEN` is configured.
- Resource editing, key-page editing, deletion, and uploads remain disabled.
- No R2 bucket exists yet.

The generated manifest remains the read model for each deployment. A successful
post commit becomes visible there after Cloudflare Pages finishes rebuilding.

## GitHub publishing token

Create a fine-grained GitHub personal access token for the service account that
will publish website content. Restrict it as follows:

- Repository access: only `ss-ar/action4equality`
- Repository permission `Contents`: Read and write
- All other repository permissions: no additional access

Store it as the encrypted Pages secret `GITHUB_TOKEN`. Do not place the token
in `wrangler.jsonc`, `.env`, Git history, screenshots, or documentation.

You can add it interactively with:

```bash
npx wrangler pages secret put GITHUB_TOKEN --project-name=action4equality
```

Every identity permitted by the Cloudflare Access application can publish. Keep
the application Allow policy to exact staff email addresses; do not use a broad
email-domain rule. Publishing is additionally restricted to the
`action4equality.org` production hostname and the `main` branch. In the Pages
dashboard, set the publishing token only for the production environment; do not
add it to the preview environment. The hostname and branch checks continue to
reject preview publishing if the token is mis-scoped.

The repository and publishing branch are non-secret values in `wrangler.jsonc`:
`ss-ar/action4equality` and `main`. Pages does not support secret declarations
in that configuration file, so configure the three dashboard secrets in the
Pages dashboard or through its API. Post publishing writes directly to `main`,
which triggers the existing Pages Git deployment. Every update supplies the
current Git blob SHA, so a stale browser cannot overwrite a newer edit.
