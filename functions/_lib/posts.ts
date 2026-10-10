import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type PostInput = {
  title: string;
  slug: string;
  date: string;
  description: string;
  featuredImage: string;
  socialImage: string;
  socialImageAlt: string;
  gallery: string[];
  body: string;
  draft: boolean;
  sha: string | null;
};

export type ParsedPost = {
  frontmatter: Record<string, unknown>;
  post: PostInput;
};

export type PostValidationResult =
  | { ok: true; data: PostInput }
  | { ok: false; errors: Record<string, string> };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidMediaReference(value: string): boolean {
  if (!value || value.includes("..") || /[\u0000-\u001f]/.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("assets/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function frontmatterString(frontmatter: Record<string, unknown>, key: string): string {
  const value = frontmatter[key];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value : "";
}

function frontmatterStringArray(frontmatter: Record<string, unknown>, key: string): string[] {
  const value = frontmatter[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function isValidPostId(value: string): boolean {
  return value.length <= 100 && SLUG_PATTERN.test(value);
}

export function validatePostInput(
  value: unknown,
  options: { isNew: boolean; id?: string },
): PostValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: { form: "Post data must be a JSON object" } };
  }

  const input = value as Record<string, unknown>;
  const title = stringValue(input.title);
  const slug = stringValue(input.slug);
  const date = stringValue(input.date);
  const description = stringValue(input.description);
  const featuredImage = stringValue(input.featuredImage);
  const socialImage = stringValue(input.socialImage);
  const socialImageAlt = stringValue(input.socialImageAlt);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const draft = input.draft === true;
  const sha = input.sha === null || input.sha === undefined ? null : stringValue(input.sha);
  const gallery = Array.isArray(input.gallery) ? input.gallery.map(stringValue).filter(Boolean) : null;
  const errors: Record<string, string> = {};

  if (title.length < 3 || title.length > 140) errors.title = "Use between 3 and 140 characters";
  if (!isValidPostId(slug)) errors.slug = "Use lowercase letters, numbers, and single hyphens only";
  if (!options.isNew && options.id && slug !== options.id) errors.slug = "A published post slug cannot be changed";
  if (options.isNew && !date) errors.date = "Choose a publication date";
  if (date && !isValidDate(date)) errors.date = "Use a valid date";
  if (description.length < 20 || description.length > 300) errors.description = "Use between 20 and 300 characters";
  if (!isValidMediaReference(featuredImage)) errors.featuredImage = "Choose an existing image path or secure URL";
  if (socialImage && !isValidMediaReference(socialImage)) errors.socialImage = "Use an existing image path or secure URL";
  if (socialImage && socialImageAlt.length < 5) errors.socialImageAlt = "Describe the social sharing image";
  if (socialImageAlt.length > 200) errors.socialImageAlt = "Use no more than 200 characters";
  if (!gallery) errors.gallery = "Gallery images must be provided as a list";
  if (gallery && gallery.length > 20) errors.gallery = "Use no more than 20 gallery images";
  if (gallery?.some((item) => !isValidMediaReference(item))) errors.gallery = "Every gallery item must be an image path or secure URL";
  if (body.length < 20 || body.length > 200_000) errors.body = "Use between 20 and 200,000 characters";
  if (!options.isNew && (!sha || !SHA_PATTERN.test(sha))) errors.form = "Reload this post before publishing changes";
  if (options.isNew && sha) errors.form = "A new post must not include a file version";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      title,
      slug,
      date,
      description,
      featuredImage,
      socialImage,
      socialImageAlt,
      gallery: gallery ?? [],
      body,
      draft,
      sha,
    },
  };
}

export function parsePostSource(source: string, sha: string): ParsedPost {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match?.[1]) throw new Error("Post front matter is missing");

  const parsed = parseYaml(match[1]);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Post front matter is invalid");
  }

  const frontmatter = parsed as Record<string, unknown>;
  return {
    frontmatter,
    post: {
      title: frontmatterString(frontmatter, "title"),
      slug: frontmatterString(frontmatter, "slug"),
      date: frontmatterString(frontmatter, "date"),
      description: frontmatterString(frontmatter, "description"),
      featuredImage: frontmatterString(frontmatter, "featured_image"),
      socialImage: frontmatterString(frontmatter, "social_image"),
      socialImageAlt: frontmatterString(frontmatter, "social_image_alt"),
      gallery: frontmatterStringArray(frontmatter, "gallery"),
      body: match[2]?.trim() ?? "",
      draft: frontmatter.draft === true,
      sha,
    },
  };
}

export function serializePost(post: PostInput, existing: Record<string, unknown> = {}): string {
  const frontmatter = { ...existing };
  const editableKeys = [
    "title",
    "slug",
    "date",
    "description",
    "featured_image",
    "social_image",
    "social_image_alt",
    "gallery",
    "draft",
  ];
  for (const key of editableKeys) delete frontmatter[key];

  frontmatter.title = post.title;
  frontmatter.slug = post.slug;
  if (post.date) frontmatter.date = post.date;
  frontmatter.description = post.description;
  frontmatter.featured_image = post.featuredImage;
  if (post.socialImage) frontmatter.social_image = post.socialImage;
  if (post.socialImageAlt) frontmatter.social_image_alt = post.socialImageAlt;
  if (post.gallery.length > 0) frontmatter.gallery = post.gallery;
  if (post.draft) frontmatter.draft = true;

  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${post.body.trim()}\n`;
}
