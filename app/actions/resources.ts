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
import {
  createWorkspace as createWorkspaceRecord,
  deleteWorkspace as deleteWorkspaceRecord,
  moveResource as moveResourceRecord,
  renameWorkspace as renameWorkspaceRecord,
} from "@/services/workspaceService";
import type {
  ActionResult,
  Resource,
  ResourceFileLinks,
  Workspace,
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

export async function createWorkspaceAction(
  value: unknown,
): Promise<ActionResult<Workspace>> {
  const name = validateWorkspaceName(value);
  if (!name) return { success: false, error: "Enter a workspace name (1–100 characters)." };
  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const workspace = await createWorkspaceRecord(supabase, user.id, name);
    revalidatePath("/library");
    return { success: true, data: workspace };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function renameWorkspaceAction(
  workspaceId: unknown,
  value: unknown,
): Promise<ActionResult<Workspace>> {
  if (typeof workspaceId !== "string" || !isUuid(workspaceId)) {
    return { success: false, error: "Choose a valid workspace." };
  }
  const name = validateWorkspaceName(value);
  if (!name) return { success: false, error: "Enter a workspace name (1–100 characters)." };
  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const workspace = await renameWorkspaceRecord(
      supabase,
      user.id,
      workspaceId,
      name,
    );
    revalidatePath("/library");
    return { success: true, data: workspace };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteWorkspaceAction(
  workspaceId: unknown,
): Promise<ActionResult<null>> {
  if (typeof workspaceId !== "string" || !isUuid(workspaceId)) {
    return { success: false, error: "Choose a valid workspace." };
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    await deleteWorkspaceRecord(supabase, user.id, workspaceId);
    revalidatePath("/library");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function moveResourceToWorkspaceAction(
  resourceId: unknown,
  workspaceId: unknown,
): Promise<ActionResult<null>> {
  if (
    typeof resourceId !== "string" ||
    !isUuid(resourceId) ||
    typeof workspaceId !== "string" ||
    !isUuid(workspaceId)
  ) {
    return { success: false, error: "Choose a valid resource and workspace." };
  }
  try {
    const { supabase } = await getAuthenticatedSupabaseClient(false);
    await moveResourceRecord(supabase, resourceId, workspaceId);
    revalidatePath("/library");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createCollectionAction(
  value: unknown,
): Promise<ActionResult<string>> {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 100) {
    return {
      success: false,
      error: "Enter a collection name between 1 and 100 characters.",
    };
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const { error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name });
    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A collection with that name already exists." };
      }
      throw new Error(`Unable to create collection: ${error.message}`);
    }
    return { success: true, data: name };
  } catch (error) {
    console.error("Collection creation failed.", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function renameCollectionAction(
  currentName: unknown,
  value: unknown,
): Promise<ActionResult<string>> {
  const oldName = typeof currentName === "string" ? currentName.trim() : "";
  const name = typeof value === "string" ? value.trim() : "";
  if (!oldName || !name || name.length > 100) {
    return {
      success: false,
      error: "Enter a collection name between 1 and 100 characters.",
    };
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const { data, error } = await supabase
      .from("collections")
      .update({ name })
      .eq("user_id", user.id)
      .eq("name", oldName)
      .select("name")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A collection with that name already exists." };
      }
      throw new Error(`Unable to rename collection: ${error.message}`);
    }
    if (!data) return { success: false, error: "Collection not found or access denied." };
    return { success: true, data: data.name };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteCollectionAction(
  value: unknown,
): Promise<ActionResult<string>> {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return { success: false, error: "Choose a valid collection." };

  try {
    const { supabase, user } = await getAuthenticatedSupabaseClient(false);
    const { data, error } = await supabase
      .from("collections")
      .delete()
      .eq("user_id", user.id)
      .eq("name", name)
      .select("name")
      .maybeSingle();
    if (error) throw new Error(`Unable to delete collection: ${error.message}`);
    if (!data) return { success: false, error: "Collection not found or access denied." };
    return { success: true, data: data.name };
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

function validateWorkspaceName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 100 ? name : null;
}
