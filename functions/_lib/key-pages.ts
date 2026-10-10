import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PAGES = {
  background: { path: "content/about/background.md", url: "/background/", body: true },
  missionVision: { path: "content/about/mission-vision.md", url: "/mission-vision/", body: true },
  objectives: { path: "content/about/objectives.md", url: "/objectives/", body: true },
  partnerships: { path: "content/about/partnerships.md", url: "/partnerships/", body: true },
  contact: { path: "content/contact.md", url: "/contact/", body: false },
} as const;

export type KeyPage = { id: keyof typeof PAGES; path: string; url: string; body: boolean };
type Input = { title: string; description: string; body: string; sha: string | null };

export function getKeyPage(id: string): KeyPage | null {
  return id in PAGES ? { id: id as keyof typeof PAGES, ...PAGES[id as keyof typeof PAGES] } : null;
}

export function parseKeyPage(source: string, page: KeyPage, sha: string): { title: string; description: string; body: string; sha: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match?.[1]) throw new Error("Page front matter is missing");
  const parsed = parseYaml(match[1]);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Page front matter is invalid");
  const frontmatter = parsed as Record<string, unknown>;
  return { title: typeof frontmatter.title === "string" ? frontmatter.title : "", description: typeof frontmatter.description === "string" ? frontmatter.description : "", body: page.body ? (match[2] || "").trim() : "", sha };
}

export function validateKeyPage(value: unknown, page: KeyPage): { ok: true; data: Input } | { ok: false; errors: Record<string, string> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, errors: { form: "Page data must be a JSON object" } };
  const source = value as Record<string, unknown>; const text = (key: string) => typeof source[key] === "string" ? source[key].trim() : "";
  const data = { title: text("title"), description: text("description"), body: text("body"), sha: source.sha === null ? null : text("sha") };
  const errors: Record<string, string> = {};
  if (data.title.length < 3 || data.title.length > 140) errors.title = "Use between 3 and 140 characters";
  if (page.id === "contact" && (data.description.length < 20 || data.description.length > 300)) errors.description = "Use between 20 and 300 characters";
  if (page.body && (data.body.length < 20 || data.body.length > 100_000)) errors.body = "Use between 20 and 100,000 characters";
  if (!data.sha || !/^[a-f0-9]{40}$/.test(data.sha)) errors.form = "Reload this page before publishing changes";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export function serializeKeyPage(source: string, page: KeyPage, input: Input): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source); if (!match?.[1]) throw new Error("Page front matter is missing");
  const parsed = parseYaml(match[1]) as Record<string, unknown>; parsed.title = input.title;
  if (page.id === "contact") parsed.description = input.description;
  return `---\n${stringifyYaml(parsed, { lineWidth: 0 }).trimEnd()}\n---\n${page.body ? `\n${input.body}\n` : ""}`;
}
