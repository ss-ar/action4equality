import { stringify as stringifyYaml } from "yaml";
import { isValidPostId } from "./posts";

export type ResourceInput = {
  title: string;
  slug: string;
  description: string;
  resourceType: string;
  publicationDate: string;
  file: string;
  weight: number;
};

const RESOURCE_TYPES = new Set(["annual-report", "audit-report", "programme-report", "publication"]);

function value(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === "string" ? input[key].trim() : "";
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateResourceInput(input: unknown): { ok: true; data: ResourceInput } | { ok: false; errors: Record<string, string> } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, errors: { form: "Resource data must be a JSON object" } };
  const source = input as Record<string, unknown>;
  const title = value(source, "title");
  const slug = value(source, "slug");
  const description = value(source, "description");
  const resourceType = value(source, "resourceType");
  const publicationDate = value(source, "publicationDate");
  const file = value(source, "file");
  const weight = Number(source.weight);
  const errors: Record<string, string> = {};

  if (title.length < 3 || title.length > 140) errors.title = "Use between 3 and 140 characters";
  if (!isValidPostId(slug)) errors.slug = "Use lowercase letters, numbers, and single hyphens only";
  if (description.length < 20 || description.length > 300) errors.description = "Use between 20 and 300 characters";
  if (!RESOURCE_TYPES.has(resourceType)) errors.resourceType = "Choose a resource type";
  if (publicationDate && !validDate(publicationDate)) errors.publicationDate = "Use a valid date";
  if (!/^\/media\/documents\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/.test(file)) errors.file = "Upload a PDF for this resource";
  if (!Number.isInteger(weight) || weight < 1 || weight > 10_000) errors.weight = "Use a whole number between 1 and 10,000";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { title, slug, description, resourceType, publicationDate, file, weight } };
}

export function serializeResource(resource: ResourceInput): string {
  const frontmatter: Record<string, unknown> = {
    title: resource.title,
    description: resource.description,
    resource_type: resource.resourceType,
    file: resource.file,
    weight: resource.weight,
    build: { render: "never", list: "always" },
  };
  if (resource.publicationDate) frontmatter.publication_date = resource.publicationDate;
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n`;
}
