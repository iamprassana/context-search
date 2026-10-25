import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmbeddings } from "@/lib/jina/embeddings";
import type { Database } from "@/types/database";
import type { SemanticSearchMatch } from "@/types/search";

const MAX_RESULTS = 20;

type SearchStage = "query-embedding" | "vector-search";

class SearchPipelineError extends Error {
  constructor(
    readonly stage: SearchStage,
    message: string,
  ) {
    super(message);
    this.name = "SearchPipelineError";
  }
}

export async function searchResources(
  supabase: SupabaseClient<Database>,
  query: string,
): Promise<SemanticSearchMatch[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  if (normalizedQuery.length > 500) {
    throw new Error("Search queries must be 500 characters or fewer.");
  }

  let queryEmbedding: number[] | undefined;
  try {
    [queryEmbedding] = await createEmbeddings(
      [normalizedQuery],
      "retrieval.query",
    );
  } catch (error) {
    const pipelineError = new SearchPipelineError(
      "query-embedding",
      error instanceof Error
        ? error.message
        : "Jina search embedding generation failed.",
    );
    logSearchFailure(pipelineError);
    throw pipelineError;
  }
  if (!queryEmbedding) {
    const error = new SearchPipelineError(
      "query-embedding",
      "Jina did not return a search embedding.",
    );
    logSearchFailure(error);
    throw error;
  }

  const { data, error } = await supabase.rpc("search_resource_chunks", {
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_match_count: MAX_RESULTS,
  });

  if (error) {
    const pipelineError = new SearchPipelineError(
      "vector-search",
      `Unable to search your resources: ${error.message}`,
    );
    logSearchFailure(pipelineError);
    throw pipelineError;
  }

  return (data ?? []).map((row) => ({
    resourceId: row.resource_id,
    title: row.title,
    type: row.resource_type,
    excerpt: row.matched_text,
  }));
}

function logSearchFailure(error: SearchPipelineError): void {
  console.error("[contextkeep:search]", { stage: error.stage });
}
