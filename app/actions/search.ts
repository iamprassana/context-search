"use server";

import { getAuthenticatedSupabaseClient } from "@/lib/supabase/authenticated";
import { indexResourceBatch } from "@/services/indexingService";
import { searchResources } from "@/services/searchService";
import type { ActionResult } from "@/types/resource";
import type { IndexBatchReport } from "@/services/indexingService";
import type { SemanticSearchMatch } from "@/types/search";

export async function searchResourcesAction(
  value: unknown,
): Promise<ActionResult<SemanticSearchMatch[]>> {
  if (typeof value !== "string") {
    return { success: false, error: "Enter a search query." };
  }

  const query = value.trim();
  if (!query) return { success: true, data: [] };
  if (query.length > 500) {
    return {
      success: false,
      error: "Search queries must be 500 characters or fewer.",
    };
  }

  try {
    const { supabase } = await getAuthenticatedSupabaseClient(false);
    const results = await searchResources(supabase, query);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function indexResourcesBatchAction(
  cursor: unknown,
): Promise<ActionResult<IndexBatchReport>> {
  if (cursor !== null && (typeof cursor !== "string" || !isUuid(cursor))) {
    return { success: false, error: "Choose a valid indexing batch." };
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const report = await indexResourceBatch(
      supabase,
      user.id,
      typeof cursor === "string" ? cursor : null,
    );
    return { success: true, data: report };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The search request failed unexpectedly. Please try again.";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
