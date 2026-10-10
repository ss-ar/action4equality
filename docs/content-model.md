# Dashboard content model

This document defines the content that the future AEF dashboard may edit. Layouts,
navigation, styles, configuration, and application code remain developer-managed.

## Publishing model

- Git is the source of truth for structured website content.
- Publishing writes validated files to the production branch.
- A Cloudflare Pages deployment makes the change live.
- Uploaded media will be stored in Cloudflare R2; content records store its public URL.
- Existing files under `static/` remain valid while media is migrated gradually.

## Posts

Location: `content/blog/<slug>.md`

| Field | Type | Rules |
| --- | --- | --- |
| `title` | text | Required, maximum 140 characters |
| `slug` | slug | Required; only `a-z`, numbers, and hyphens |
| `date` | date | Required for new posts |
| `description` | text | Required, maximum 300 characters |
| `featured_image` | media URL | Required |
| `social_image` | media URL | Optional |
| `social_image_alt` | text | Required when `social_image` is present |
| `gallery` | media URL list | Optional |
| body | rich text | Required; stored as Markdown |

The dashboard must not expose `aliases` for routine editing. Existing aliases are
preserved to protect migrated URLs.

## Resources

Location: `content/resources/<slug>.md`

| Field | Type | Rules |
| --- | --- | --- |
| `title` | text | Required, maximum 140 characters |
| `description` | text | Required, maximum 300 characters |
| `resource_type` | choice | `annual-report`, `audit-report`, `programme-report`, or `publication` |
| `publication_date` | date | Optional when the source has no stated date |
| `file` | document URL | Required; dashboard uploads accept PDF only, up to 8 MB |
| `weight` | integer | Controls display order |

Resource records appear on `/resources/` but do not generate separate detail pages.

## Homepage

Location: `data/homepage.yaml`

The dashboard may edit text, image references, and existing call-to-action links in
this file. It may reorder programme and audience images, but it may not add arbitrary
HTML, CSS classes, or new page sections.

## Key pages

Initial allowlist:

- `content/about/background.md`
- `content/about/mission-vision.md`
- `content/about/objectives.md`
- `content/about/partnerships.md`
- `content/contact.md`

Editable fields are `title`, `description` where present, and the Markdown body.
Slugs and aliases remain locked after publication to avoid broken links.

## Protected paths

The dashboard API must reject writes outside the paths listed above. In particular,
it must never write to `layouts/`, `assets/`, `static/`, `hugo.toml`, workflow files,
or Cloudflare configuration.
