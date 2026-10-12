import { parse, stringify } from "yaml";
import type { AdminData } from "../../_lib/admin-auth";
import { getRepositoryFile, putRepositoryFile } from "../../_lib/github";
import { canPublishPosts } from "../../_lib/permissions";
import { readJsonBody } from "../../_lib/request";

const path = "data/homepage.yaml";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const sections = ["hero", "introduction", "programmes", "audience", "stories", "support"] as const;

function text(value: unknown, min = 1, max = 500): string | null {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function homepage(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const name of sections) {
    if (!object(source[name])) throw new Error("Homepage structure is invalid");
    result[name] = source[name];
  }
  return result;
}

function requireText(source: Record<string, unknown>, key: string, min = 1, max = 500): string {
  const value = text(source[key], min, max);
  if (!value) throw new Error(`Homepage ${key.replace(/_/g, " ")} is invalid`);
  return value;
}

function action(value: unknown): Record<string, string> {
  const source = object(value);
  if (!source) throw new Error("Homepage action is invalid");
  return { label: requireText(source, "label", 1, 100), url: requireText(source, "url", 1, 300) };
}

function textList(value: unknown, min: number, max: number, itemMax = 300): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error("Homepage list is invalid");
  return value.map((item) => {
    const result = text(item, 1, itemMax);
    if (!result) throw new Error("Homepage list item is invalid");
    return result;
  });
}

function validate(input: unknown): Record<string, unknown> {
  const source = object(input);
  if (!source) throw new Error("Homepage data is invalid");
  const hero = object(source.hero); const introduction = object(source.introduction); const programmes = object(source.programmes);
  const audience = object(source.audience); const stories = object(source.stories); const support = object(source.support);
  if (!hero || !introduction || !programmes || !audience || !stories || !support) throw new Error("Homepage data is incomplete");
  const programmeItems = programmes.items;
  const audienceImages = audience.images;
  if (!Array.isArray(programmeItems) || programmeItems.length < 1 || programmeItems.length > 12) throw new Error("Homepage programme cards are invalid");
  if (!Array.isArray(audienceImages) || audienceImages.length < 1 || audienceImages.length > 8) throw new Error("Homepage audience images are invalid");
  return {
    hero: { eyebrow: requireText(hero, "eyebrow"), title: requireText(hero, "title"), description: requireText(hero, "description", 20), image: requireText(hero, "image", 1, 300), image_alt: requireText(hero, "image_alt", 1, 200), image_width: requireText(hero, "image_width", 1, 5), image_height: requireText(hero, "image_height", 1, 5), primary_action: action(hero.primary_action), secondary_action: action(hero.secondary_action), highlights: textList(hero.highlights, 1, 8, 100) },
    introduction: { eyebrow: requireText(introduction, "eyebrow"), title: requireText(introduction, "title"), paragraphs: textList(introduction.paragraphs, 1, 8), image: requireText(introduction, "image", 1, 300), image_alt: requireText(introduction, "image_alt", 1, 200), image_width: requireText(introduction, "image_width", 1, 5), image_height: requireText(introduction, "image_height", 1, 5), image_note: requireText(introduction, "image_note", 1, 200), action: action(introduction.action) },
    programmes: { eyebrow: requireText(programmes, "eyebrow"), title: requireText(programmes, "title"), description: requireText(programmes, "description", 20), items: programmeItems.map((item) => { const card = object(item); if (!card) throw new Error("Homepage programme card is invalid"); return { title: requireText(card, "title", 1, 100), description: requireText(card, "description", 1, 300), image: requireText(card, "image", 1, 300), image_alt: requireText(card, "image_alt", 1, 200), image_width: requireText(card, "image_width", 1, 5), image_height: requireText(card, "image_height", 1, 5), url: requireText(card, "url", 1, 300) }; }) },
    audience: { eyebrow: requireText(audience, "eyebrow"), title: requireText(audience, "title"), description: requireText(audience, "description", 20), action: action(audience.action), images: audienceImages.map((item) => { const image = object(item); if (!image) throw new Error("Homepage audience image is invalid"); return { src: requireText(image, "src", 1, 300), alt: requireText(image, "alt", 1, 200), width: requireText(image, "width", 1, 5), height: requireText(image, "height", 1, 5) }; }) },
    stories: { eyebrow: requireText(stories, "eyebrow"), title: requireText(stories, "title"), action_label: requireText(stories, "action_label", 1, 100) },
    support: { eyebrow: requireText(support, "eyebrow"), title: requireText(support, "title"), primary_action: action(support.primary_action), secondary_action: action(support.secondary_action) },
  };
}

export const onRequestGet: PagesFunction<Env, string, AdminData> = async (context) => {
  try { const file = await getRepositoryFile(context.env, path); const source = parse(file.content) as Record<string, unknown>; return Response.json({ homepage: homepage(source), sha: file.sha }, { headers }); }
  catch { return Response.json({ error: "Homepage could not be loaded" }, { status: 500, headers }); }
};

export const onRequestPut: PagesFunction<Env, string, AdminData> = async (context) => {
  if (!canPublishPosts(context.request, context.data.user, context.env)) return Response.json({ error: "You do not have permission to publish pages" }, { status: 403, headers });
  try {
    const input = await readJsonBody(context.request) as Record<string, unknown>; const sha = text(input.sha, 40, 40);
    if (!sha) throw new Error("Reload the homepage before publishing changes");
    const update = validate(input.homepage); const current = await getRepositoryFile(context.env, path);
    if (current.sha !== sha) return Response.json({ error: "Homepage changed after you opened it. Reload before publishing." }, { status: 409, headers });
    const source = parse(current.content) as Record<string, unknown>; homepage(source);
    for (const name of sections) source[name] = update[name];
    const result = await putRepositoryFile(context.env, { path, sha: current.sha, content: stringify(source, { lineWidth: 0 }), message: "Update homepage content" });
    console.log(JSON.stringify({ message: "homepage published", editor: context.data.user.email, commitSha: result.commitSha }));
    return Response.json({ message: "Homepage committed. Cloudflare Pages is rebuilding the website.", sha: result.fileSha }, { headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Homepage could not be published" }, { status: 422, headers }); }
};
