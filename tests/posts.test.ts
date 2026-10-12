import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parsePostSource,
  serializePost,
  validatePostInput,
} from "../functions/_lib/posts";
import { canPublishPosts } from "../functions/_lib/permissions";
import { serializeResource, validateResourceInput } from "../functions/_lib/resources";

async function main(): Promise<void> {
  const sha = "a".repeat(40);
  const source = await readFile(
    new URL("../content/blog/empowering-children-through-child-rights-club.md", import.meta.url),
    "utf8",
  );
  const parsed = parsePostSource(source, sha);

  assert.equal(parsed.post.slug, "empowering-children-through-child-rights-club");
  assert.equal(parsed.post.sha, sha);
  assert.ok(parsed.post.body.includes("Formation of Child Rights Clubs"));
  assert.ok(Array.isArray(parsed.frontmatter.aliases));

  const validation = validatePostInput(parsed.post, {
    isNew: false,
    id: parsed.post.slug,
  });
  assert.equal(validation.ok, true);

  if (validation.ok) {
    const updated = {
      ...validation.data,
      title: "Updated child rights story",
    };
    const serialized = serializePost(updated, parsed.frontmatter);
    const reparsed = parsePostSource(serialized, sha);

    assert.equal(reparsed.post.title, "Updated child rights story");
    assert.deepEqual(reparsed.frontmatter.aliases, parsed.frontmatter.aliases);
    assert.deepEqual(reparsed.frontmatter.images, parsed.frontmatter.images);
    assert.equal(reparsed.post.body, parsed.post.body);

    const updatedWithLastmod = serializePost(updated, parsed.frontmatter, "2026-10-12");
    assert.match(updatedWithLastmod, /lastmod: 2026-10-12/);
  }

  const invalid = validatePostInput(
    {
      ...parsed.post,
      slug: "../../unsafe",
      sha: null,
    },
    { isNew: true },
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.errors.slug);

  const omittedGallery = validatePostInput(
    { ...parsed.post, gallery: undefined },
    { isNew: false, id: parsed.post.slug },
  );
  assert.equal(omittedGallery.ok, false);
  if (!omittedGallery.ok) assert.ok(omittedGallery.errors.gallery);

  const resource = validateResourceInput({
    title: "Community report 2026",
    slug: "community-report-2026",
    description: "A public report covering the organisation's community work during 2026.",
    resourceType: "programme-report",
    publicationDate: "2026-10-11",
    file: "/media/documents/2026/10/00000000-0000-0000-0000-000000000000.pdf",
    weight: 20,
  }, { isNew: true });
  assert.equal(resource.ok, true);
  if (resource.ok) assert.match(serializeResource(resource.data), /build:\n  render: never/);

  const invalidResource = validateResourceInput({ file: "/media/documents/not-a-pdf.docx" }, { isNew: true });
  assert.equal(invalidResource.ok, false);
  if (!invalidResource.ok) assert.ok(invalidResource.errors.file);

  const publishingEnv = {
    GITHUB_REPOSITORY: "ss-ar/action4equality",
    GITHUB_CONTENT_BRANCH: "main",
    PUBLISHING_HOST: "action4equality.org",
    GITHUB_TOKEN: "test-token",
  } as Env;
  const publisher = { email: "EDITOR@example.org", name: null };
  assert.equal(
    canPublishPosts(new Request("https://action4equality.org/api/admin/posts"), publisher, publishingEnv),
    true,
  );
  assert.equal(
    canPublishPosts(new Request("https://preview.action4equality.pages.dev/api/admin/posts"), publisher, publishingEnv),
    false,
  );
  assert.equal(
    canPublishPosts(
      new Request("https://action4equality.org/api/admin/posts"),
      publisher,
      { ...publishingEnv, GITHUB_CONTENT_BRANCH: "preview" } as Env,
    ),
    false,
  );

  console.log("Post validation and serialization tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
