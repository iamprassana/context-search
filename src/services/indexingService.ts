import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmbeddings,
  createFileEmbedding,
  JINA_FILE_SIZE_LIMITS,
  type JinaFileMimeType,
} from "@/lib/jina/embeddings";
import { STORAGE_BUCKET } from "@/lib/storage/config";
import { chunkText } from "@/lib/search/chunkText";
import { fetchReadableWebpageText } from "@/lib/webpage/fetch-readable-text";
import type { Database } from "@/types/database";

const RESOURCE_BATCH_SIZE = 5;

type IndexableResource = {
  id: string;
  title: string;
  resource_type: "url" | "note" | "code" | "file";
  url: string | null;
  content: string | null;
  language: string | null;
  updated_at: string;
};

export type IndexingStage =
  | "resource-load"
  | "file-metadata"
  | "file-size"
  | "storage-download"
  | "file-validation"
  | "jina-file-embedding"
  | "url-page-fetch"
  | "existing-index-read"
  | "text-chunking"
  | "jina-embedding"
  | "vector-persistence"
  | "batch-list";

export class IndexingPipelineError extends Error {
  constructor(
    readonly stage: IndexingStage,
    message: string,
  ) {
    super(message);
    this.name = "IndexingPipelineError";
  }
}

export type IndexBatchReport = {
  indexed: number;
  skipped: number;
  failed: number;
  failures: Array<{ title: string; message: string }>;
  nextCursor: string | null;
};

export async function indexResource(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
): Promise<"indexed" | "skipped"> {
  try {
    return await indexResourceForUser(supabase, userId, resourceId);
  } catch (error) {
    logIndexingFailure(error);
    throw error;
  }
}

async function indexResourceForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
): Promise<"indexed" | "skipped"> {
  const { data: resource, error } = await supabase
    .from("resources")
    .select("id,title,resource_type,url,content,language,updated_at")
    .eq("id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new IndexingPipelineError(
      "resource-load",
      `Unable to load resource for indexing: ${error.message}`,
    );
  }
  if (!resource) {
    throw new IndexingPipelineError(
      "resource-load",
      "Resource not found or access denied.",
    );
  }

  if (resource.resource_type === "file") {
    return indexFileResource(supabase, userId, resource);
  }

  const searchable = await getSearchableText(resource);
  const searchableText = searchable.text;
  if (!searchableText) {
    await replaceChunks(supabase, resource, null, [], []);
    if (searchable.warning) throw searchable.warning;
    return "skipped";
  }

  const contentHash = createHash("sha256")
    .update(searchableText)
    .digest("hex");
  let chunks: string[];
  try {
    chunks = chunkText(searchableText);
  } catch {
    throw new IndexingPipelineError(
      "text-chunking",
      "Unable to split this resource into searchable text chunks.",
    );
  }
  if (chunks.length === 0) return "skipped";
  if (chunks.length > 100) {
    throw new IndexingPipelineError(
      "text-chunking",
      "This resource is too long to index in one operation.",
    );
  }

  const { data: existing, error: chunkError } = await supabase
    .from("resource_chunks")
    .select("chunk_index,content_hash,resource_updated_at")
    .eq("resource_id", resourceId)
    .eq("user_id", userId)
    .order("chunk_index", { ascending: true });

  if (chunkError) {
    throw new IndexingPipelineError(
      "existing-index-read",
      `Unable to check the existing search index: ${chunkError.message}`,
    );
  }
  if (
    existing?.length === chunks.length &&
    existing.every(
      (chunk, index) =>
        chunk.content_hash === contentHash &&
        chunk.chunk_index === index &&
        chunk.resource_updated_at === resource.updated_at,
    )
  ) {
    if (searchable.warning) throw searchable.warning;
    return "skipped";
  }

  let embeddings: number[][];
  try {
    embeddings = await createEmbeddings(chunks, "retrieval.passage");
  } catch (error) {
    throw new IndexingPipelineError(
      "jina-embedding",
      error instanceof Error
        ? error.message
        : "Jina embedding generation failed.",
    );
  }

  await replaceChunks(supabase, resource, contentHash, chunks, embeddings);
  if (searchable.warning) throw searchable.warning;
  return "indexed";
}

async function indexFileResource(
  supabase: SupabaseClient<Database>,
  userId: string,
  resource: IndexableResource,
): Promise<"indexed" | "skipped"> {
  const { data: file, error: fileError } = await supabase
    .from("resource_files")
    .select("storage_path,mime_type,original_filename,file_size")
    .eq("resource_id", resource.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fileError || !file) {
    throw new IndexingPipelineError(
      "file-metadata",
      fileError
        ? `Unable to load file metadata: ${fileError.message}`
        : "The file metadata is unavailable for this resource.",
    );
  }

  if (
    file.mime_type !== "application/pdf" &&
    file.mime_type !== "image/jpeg" &&
    file.mime_type !== "image/png" &&
    file.mime_type !== "image/webp"
  ) {
    throw new IndexingPipelineError(
      "file-metadata",
      "This file type is not supported for multimodal indexing.",
    );
  }

  const maximumBytes = JINA_FILE_SIZE_LIMITS[file.mime_type];
  const maximumLabel = file.mime_type === "application/pdf" ? "8 MB" : "5 MB";
  if (file.file_size <= 0 || file.file_size > maximumBytes) {
    throw new IndexingPipelineError(
      "file-size",
      `${file.mime_type === "application/pdf" ? "PDFs" : "Images"} must be no larger than ${maximumLabel} for Jina indexing.`,
    );
  }

  const { data: storedFile, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(file.storage_path);
  if (downloadError || !storedFile) {
    throw new IndexingPipelineError(
      "storage-download",
      downloadError
        ? `Unable to retrieve the private file: ${downloadError.message}`
        : "The private file could not be retrieved.",
    );
  }

  const bytes = new Uint8Array(await storedFile.arrayBuffer());
  if (bytes.byteLength !== file.file_size || bytes.byteLength > maximumBytes) {
    throw new IndexingPipelineError(
      "file-size",
      `The stored file size does not match its metadata or exceeds the ${maximumLabel} Jina limit.`,
    );
  }
  if (!matchesFileSignature(bytes, file.mime_type)) {
    throw new IndexingPipelineError(
      "file-validation",
      "The stored file contents do not match the recorded MIME type.",
    );
  }

  const fileDescription =
    file.mime_type === "application/pdf"
      ? `Whole-document PDF embedding (no passage extraction): ${resource.title}\nFile: ${file.original_filename}`
      : `Visual image embedding: ${resource.title}\nFile: ${file.original_filename}`;
  const noteText = resource.content?.trim()
    ? `Title: ${resource.title}\nType: file\n\nNotes:\n${resource.content.trim()}`
    : "";
  let noteChunks: string[];
  try {
    noteChunks = noteText ? chunkText(noteText) : [];
  } catch {
    throw new IndexingPipelineError(
      "text-chunking",
      "Unable to split this file's notes into searchable text chunks.",
    );
  }

  const contents = [fileDescription, ...noteChunks];
  if (contents.length > 100) {
    throw new IndexingPipelineError(
      "text-chunking",
      "This resource is too long to index in one operation.",
    );
  }

  const contentHash = createHash("sha256")
    .update(file.mime_type)
    .update(bytes)
    .update(resource.title)
    .update(noteText)
    .digest("hex");

  const { data: existing, error: chunkError } = await supabase
    .from("resource_chunks")
    .select("chunk_index,content_hash,resource_updated_at")
    .eq("resource_id", resource.id)
    .eq("user_id", userId)
    .order("chunk_index", { ascending: true });
  if (chunkError) {
    throw new IndexingPipelineError(
      "existing-index-read",
      `Unable to check the existing search index: ${chunkError.message}`,
    );
  }
  if (
    existing?.length === contents.length &&
    existing.every(
      (chunk, index) =>
        chunk.content_hash === contentHash &&
        chunk.chunk_index === index &&
        chunk.resource_updated_at === resource.updated_at,
    )
  ) {
    return "skipped";
  }

  let fileEmbedding: number[];
  try {
    fileEmbedding = await createFileEmbedding(
      bytes,
      file.mime_type,
    );
  } catch (error) {
    throw new IndexingPipelineError(
      "jina-file-embedding",
      getErrorMessage(error, "Jina file embedding generation failed."),
    );
  }

  let noteEmbeddings: number[][] = [];
  if (noteChunks.length > 0) {
    try {
      noteEmbeddings = await createEmbeddings(noteChunks, "retrieval.passage");
    } catch (error) {
      throw new IndexingPipelineError(
        "jina-embedding",
        getErrorMessage(error, "Jina note embedding generation failed."),
      );
    }
  }

  await replaceChunks(supabase, resource, contentHash, contents, [
    fileEmbedding,
    ...noteEmbeddings,
  ]);
  return "indexed";
}

export async function indexResourceBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  cursor: string | null,
): Promise<IndexBatchReport> {
  let resourceQuery = supabase
    .from("resources")
    .select("id,title,resource_type,url,content,language,updated_at")
    .eq("user_id", userId)
    .in("resource_type", ["note", "code", "url", "file"])
    .order("id", { ascending: true })
    .limit(RESOURCE_BATCH_SIZE + 1);

  if (cursor) resourceQuery = resourceQuery.gt("id", cursor);

  const { data, error } = await resourceQuery;
  if (error) {
    const pipelineError = new IndexingPipelineError(
      "batch-list",
      `Unable to list resources to index: ${error.message}`,
    );
    logIndexingFailure(pipelineError);
    throw pipelineError;
  }

  const resources = data ?? [];
  const hasMore = resources.length > RESOURCE_BATCH_SIZE;
  const batch = resources.slice(0, RESOURCE_BATCH_SIZE);
  const report: IndexBatchReport = {
    indexed: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    nextCursor:
      hasMore && batch.length > 0 ? batch[batch.length - 1].id : null,
  };

  for (const resource of batch) {
    try {
      const result = await indexResource(supabase, userId, resource.id);
      if (result === "indexed") report.indexed += 1;
      else report.skipped += 1;
    } catch (error) {
      report.failed += 1;
      report.failures.push({
        title: resource.title,
        message:
          error instanceof Error
            ? error.message
            : "The resource could not be indexed.",
      });
    }
  }

  return report;
}

async function getSearchableText(
  resource: IndexableResource,
): Promise<{ text: string; warning?: IndexingPipelineError }> {
  let extractedWebpageText = "";
  let webpageWarning: IndexingPipelineError | undefined;
  if (resource.resource_type === "url") {
    if (!resource.url) {
      throw new IndexingPipelineError(
        "url-page-fetch",
        "This saved link has no URL to index.",
      );
    }

    try {
      extractedWebpageText = await fetchReadableWebpageText(resource.url);
    } catch (error) {
      webpageWarning = new IndexingPipelineError(
        "url-page-fetch",
        resource.content?.trim()
          ? `The webpage could not be indexed; saved link notes were indexed separately. ${getErrorMessage(error)}`
          : getErrorMessage(error),
      );
      if (!resource.content?.trim()) throw webpageWarning;
    }
  }

  const contentParts = [
    resource.content?.trim(),
    extractedWebpageText,
  ].filter((part): part is string => Boolean(part));
  if (contentParts.length === 0) {
    return { text: "", warning: webpageWarning };
  }

  const language =
    resource.resource_type === "code" && resource.language
      ? `\nLanguage: ${resource.language}`
      : "";
  return {
    text: `Title: ${resource.title}\nType: ${resource.resource_type}${language}\n\n${contentParts.join("\n\n")}`,
    warning: webpageWarning,
  };
}

function getErrorMessage(
  error: unknown,
  fallback = "The resource could not be indexed.",
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

function matchesFileSignature(
  bytes: Uint8Array,
  mimeType: JinaFileMimeType,
): boolean {
  if (mimeType === "application/pdf") {
    return Buffer.from(bytes.subarray(0, 1024))
      .toString("latin1")
      .includes("%PDF-");
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
}

async function replaceChunks(
  supabase: SupabaseClient<Database>,
  resource: IndexableResource,
  contentHash: string | null,
  contents: string[],
  embeddings: number[][],
): Promise<void> {
  const { error } = await supabase.rpc("replace_resource_chunks", {
    p_resource_id: resource.id,
    p_resource_updated_at: resource.updated_at,
    p_content_hash: contentHash,
    p_contents: contents,
    p_embeddings: embeddings.map((embedding) => JSON.stringify(embedding)),
  });

  if (error) {
    throw new IndexingPipelineError(
      "vector-persistence",
      `Unable to update the resource search index: ${error.message}`,
    );
  }
}

export function logIndexingFailure(error: unknown): void {
  if (error instanceof IndexingPipelineError) {
    console.error("[contextkeep:indexing]", { stage: error.stage });
    return;
  }
  console.error("[contextkeep:indexing]", { stage: "unexpected" });
}
