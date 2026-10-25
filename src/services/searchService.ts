import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmbeddings } from "@/lib/jina/embeddings";
import {
  fuseRankedCandidates,
  getMinimumCosineSimilarity,
  passesCosineSimilarityThreshold,
  type RankedSearchCandidate,
  type SearchCandidateMatch,
} from "@/lib/search/rankResults";
import type { Database } from "@/types/database";
import type { SemanticSearchMatch } from "@/types/search";

const MAX_RESULTS = 20;

type SearchStage = "query-embedding" | "vector-search" | "keyword-search";

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

  if (normalizedQuery.length <= 2) {
    const { data, error } = await supabase.rpc(
      "search_resource_chunks_keyword",
      {
        p_query: normalizedQuery,
        p_match_count: MAX_RESULTS,
      },
    );
    if (error) {
      const pipelineError = new SearchPipelineError(
        "keyword-search",
        `Unable to search resource keywords: ${error.message}`,
      );
      logSearchFailure(pipelineError);
      throw pipelineError;
    }
    return fuseRankedCandidates([], mapKeywordCandidates(data ?? []), MAX_RESULTS);
  }

  let minimumSimilarity: number;
  try {
    minimumSimilarity = getMinimumCosineSimilarity();
  } catch (error) {
    const pipelineError = new SearchPipelineError(
      "vector-search",
      error instanceof Error
        ? error.message
        : "The configured similarity threshold is invalid.",
    );
    logSearchFailure(pipelineError);
    throw pipelineError;
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

  const [semanticResult, keywordResult] = await Promise.all([
    supabase.rpc("search_resource_chunks", {
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_match_count: MAX_RESULTS,
    }),
    supabase.rpc("search_resource_chunks_keyword", {
      p_query: normalizedQuery,
      p_match_count: MAX_RESULTS,
    }),
  ]);

  if (semanticResult.error) {
    const pipelineError = new SearchPipelineError(
      "vector-search",
      `Unable to search your resources: ${semanticResult.error.message}`,
    );
    logSearchFailure(pipelineError);
    throw pipelineError;
  }
  if (keywordResult.error) {
    const pipelineError = new SearchPipelineError(
      "keyword-search",
      `Unable to search resource keywords: ${keywordResult.error.message}`,
    );
    logSearchFailure(pipelineError);
    throw pipelineError;
  }

  const semanticCandidates: RankedSearchCandidate[] = (semanticResult.data ?? [])
    .filter((row) =>
      passesCosineSimilarityThreshold(row.distance, minimumSimilarity),
    )
    .map((row) => ({
      resourceId: row.resource_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      title: row.title,
      type: row.resource_type,
      excerpt: row.matched_text,
    }));
  const keywordCandidates = mapKeywordCandidates(keywordResult.data ?? []);

  return fuseRankedCandidates(
    semanticCandidates,
    keywordCandidates,
    MAX_RESULTS,
  );
}

type KeywordSearchRow =
  Database["public"]["Functions"]["search_resource_chunks_keyword"]["Returns"][number];

function mapKeywordCandidates(
  rows: readonly KeywordSearchRow[],
): SearchCandidateMatch[] {
  return rows.map((row) => ({
    resourceId: row.resource_id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    title: row.title,
    type: row.resource_type,
    excerpt: row.matched_text,
    exactKeywordMatch: row.exact_match,
  }));
}

function logSearchFailure(error: SearchPipelineError): void {
  console.error("[contextkeep:search]", { stage: error.stage });
}
