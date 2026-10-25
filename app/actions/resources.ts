"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseClient } from "@/lib/supabase/authenticated";
import {
  createResource as createResourceRecord,
  deleteResourceWithFile,
  setResourceFavorite,
  updateResource as updateResourceRecord,
} from "@/services/resourceService";
import {
  IndexingPipelineError,
  indexResource,
} from "@/services/indexingService";
import { validateResourceInput } from "@/lib/validation/resource";
import { getMaxUploadSizeBytes } from "@/lib/storage/config";
import {
  createResourceFileLinks,
  uploadResourceFile,
} from "@/services/storageService";
import type {
  ActionResult,
  Resource,
  ResourceFileLinks,
} from "@/types/resource";

export async function createResourceAction(
  value: unknown,
): Promise<ActionResult<Resource>> {
  const validation = validateResourceInput(value);
  if ("error" in validation) return { success: false, error: validation.error };

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const resource = await createResourceRecord(
      supabase,
      user.id,
      validation.input,
    );
    revalidatePath("/library");
    let warning: string | undefined;
    try {
      await indexResource(supabase, user.id, resource.id);
    } catch (error) {
      warning = `Resource saved, but search indexing failed: ${getIndexingErrorMessage(error)} You can retry indexing from search.`;
    }
    return { success: true, data: resource, warning };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function uploadResourceFileAction(
  value: unknown,
  file: File,
): Promise<ActionResult<Resource>> {
  const validation = validateResourceInput(value);
  if ("error" in validation) return { success: false, error: validation.error };
  if (validation.input.type !== "PDF" && validation.input.type !== "Image") {
    return { success: false, error: "Choose a PDF or supported image file." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "Choose a file to upload." };
  }

  try {
    const maxFileSizeBytes = getMaxUploadSizeBytes();
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const resource = await uploadResourceFile(
      supabase,
      user.id,
      validation.input,
      file,
      maxFileSizeBytes,
    );
    revalidatePath("/library");
    let warning: string | undefined;
    try {
      await indexResource(supabase, user.id, resource.id);
    } catch (error) {
      warning = `Resource saved, but search indexing failed: ${getIndexingErrorMessage(error)} You can retry indexing from search.`;
    }
    return { success: true, data: resource, warning };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateResourceAction(
  resourceId: unknown,
  value: unknown,
): Promise<ActionResult<Resource>> {
  if (typeof resourceId !== "string" || !isUuid(resourceId)) {
    return { success: false, error: "Choose a valid resource." };
  }
  const validation = validateResourceInput(value);
  if ("error" in validation) return { success: false, error: validation.error };

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const resource = await updateResourceRecord(
      supabase,
      user.id,
      resourceId,
      validation.input,
    );
    revalidatePath("/library");
    let warning: string | undefined;
    try {
      await indexResource(supabase, user.id, resource.id);
    } catch (error) {
      warning = `Resource updated, but search indexing failed: ${getIndexingErrorMessage(error)} You can retry indexing from search.`;
    }
    return { success: true, data: resource, warning };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function setFavoriteAction(
  resourceId: unknown,
  isFavorite: unknown,
): Promise<ActionResult<null>> {
  if (
    typeof resourceId !== "string" ||
    !isUuid(resourceId) ||
    typeof isFavorite !== "boolean"
  ) {
    return { success: false, error: "Choose a valid favorite action." };
  }

  try {
    const { supabase } = await getAuthenticatedSupabaseClient(false);
    await setResourceFavorite(supabase, resourceId, isFavorite);
    revalidatePath("/library");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteResourceAction(
  resourceId: unknown,
): Promise<ActionResult<null>> {
  if (typeof resourceId !== "string" || !isUuid(resourceId)) {
    return { success: false, error: "Choose a valid resource." };
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    await deleteResourceWithFile(supabase, user.id, resourceId);
    revalidatePath("/library");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createResourceFileLinksAction(
  resourceId: unknown,
): Promise<ActionResult<ResourceFileLinks>> {
  if (typeof resourceId !== "string" || !isUuid(resourceId)) {
    return { success: false, error: "Choose a valid resource." };
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const links = await createResourceFileLinks(
      supabase,
      user.id,
      resourceId,
    );
    return { success: true, data: links };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The resource request failed unexpectedly. Please try again.";
}

function getIndexingErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  return error instanceof IndexingPipelineError
    ? `${message} [stage: ${error.stage}]`
    : message;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
