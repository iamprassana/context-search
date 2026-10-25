# ContextKeep

ContextKeep is a personal library for saving links, notes, code snippets,
images, and PDFs, then finding them later. The library uses Supabase for
authentication, database persistence, and private file storage. Natural
language search uses Jina embeddings to retrieve matching notes, code, and
saved notes associated with links.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and set the project URL and publishable
   key from the Supabase project settings.
3. Apply any unapplied SQL migrations under `supabase/migrations/` in timestamp
   order using the Supabase SQL Editor or Supabase CLI. The migrations create
   the private `contextkeep-files` bucket and the private semantic-search index
   with per-user ownership policies.
4. Configure the Supabase Auth email provider and redirect URLs for your local
   and deployed application origins.
5. Start the app with `bun run dev`.

If Supabase is not configured or a migration has not been applied, the library
shows the setup or query error rather than substituting sample data. Add a
server-only `JINA_API_KEY` to `.env.local` to enable semantic search and
indexing. Obtain the key from [Jina AI](https://jina.ai/embeddings/); do not
prefix it with `NEXT_PUBLIC_`.

New notes, code snippets, saved webpages, PDFs, and images are indexed after
creation and edits. Webpages are fetched on the server with redirect
revalidation and DNS-pinned public-address checks; only HTTP(S) HTML/XHTML
responses up to 2 MiB are read, with per-request and total timeouts. PDFs and
images are downloaded from private Storage and sent to Jina's multimodal
embedding endpoint as base64 data; private Storage URLs are never sent. PDF
files are limited to 8 MB and images to 5 MB for indexing. PDF search uses
one whole-document embedding per file and does not return passage-level or
page-level matches. Text notes attached to files are indexed as separate text
chunks. Image visual embeddings share a vector space with text queries.

If Jina or webpage retrieval is unavailable, the resource is still saved and
the library reports the failed pipeline stage. Use the search page's **Index or
retry saved resources** action to retry existing notes, code, webpages, PDFs,
and images in batches of five; unchanged content is skipped. Deleting a
resource cascades to its search chunks through the owner-matched foreign key.

Uploads accept PDF, JPEG, PNG, and WebP files. By default, uploads are limited
to 10 MiB. Set `NEXT_PUBLIC_CONTEXTKEEP_MAX_UPLOAD_SIZE_BYTES` to a byte count
to choose another limit up to 50 MiB. The storage bucket is capped at 50 MiB;
raise its Supabase limit and the Server Action body size limit in `next.config.ts`
before increasing the application cap.

Files upload through an authenticated Server Action to the private bucket.
Signed preview and download URLs are issued only after checking the signed-in
user's file metadata. Deleting a resource removes its stored object before
deleting the database record. Never make the bucket public or add a service-role
key to the application environment.

## Development checks

- `bun run lint`
- `bunx tsc --noEmit`
- `bun run build`

## Semantic search

The app uses Jina's `jina-embeddings-v5-omni-small` model (1,024 dimensions)
with `retrieval.passage` embeddings for saved content and `retrieval.query`
embeddings for searches. Text, images, and PDFs use this model's shared
multimodal vector space. The `resource_chunks` table uses pgvector cosine
distance, row-level security and owner-matched foreign keys. Search calls a
database function that filters by the authenticated user's ID and returns at
most one best-matching chunk per resource.

Apply `20261025170000_add_semantic_search.sql` after the existing migrations
and `20261025173000_hide_stale_search_chunks.sql` immediately afterward before
using indexing or semantic search. The follow-up migration hides chunks from
older resource versions until they are successfully re-indexed.

## Storage upload verification

After applying the migrations, sign in and upload one PDF, JPEG, PNG, and WebP.
Confirm preview/download works, then delete each resource. Also verify an
unsupported file and a file over the configured size are rejected, and test
that a second user cannot preview or delete the first user's file.