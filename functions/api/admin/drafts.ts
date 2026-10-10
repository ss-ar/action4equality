import type { AdminData } from "../../_lib/admin-auth";
import { getRepositoryFile, listRepositoryFiles } from "../../_lib/github";
import { parsePostSource } from "../../_lib/posts";

export const onRequestGet: PagesFunction<Env, string, AdminData> = async (context) => {
  try {
    const entries = await listRepositoryFiles(context.env, "content/blog");
    const files = entries.filter((entry) => entry.type === "file" && /^content\/blog\/[a-z0-9-]+\.md$/.test(entry.path)).slice(0, 100);
    const drafts = await Promise.all(files.map(async (entry) => {
      const file = await getRepositoryFile(context.env, entry.path); const parsed = parsePostSource(file.content, file.sha);
      return parsed.post.draft ? { id: entry.path.slice("content/blog/".length, -3), ...parsed.post, status: "draft" } : null;
    }));
    return Response.json({ posts: drafts.filter(Boolean) }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: "Draft posts could not be loaded" }, { status: 500 }); }
};
