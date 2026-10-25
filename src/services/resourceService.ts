import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { STORAGE_BUCKET } from "@/lib/storage/config";
import type {
  Resource,
  ResourceInput,
  ResourceLibraryData,
  ResourceType,
} from "@/types/resource";

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type ResourceFileRow = Database["public"]["Tables"]["resource_files"]["Row"];

export async function listResources(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ResourceLibraryData> {
  const [resourcesResult, collectionsResult, collectionLinksResult, tagsResult, tagLinksResult, filesResult] =
    await Promise.all([
      supabase
        .from("resources")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("collections")
        .select("id,name")
        .eq("user_id", userId)
        .order("name"),
      supabase
        .from("collection_resources")
        .select("resource_id,collection_id")
        .eq("user_id", userId),
      supabase.from("tags").select("id,name").eq("user_id", userId),
      supabase
        .from("resource_tags")
        .select("resource_id,tag_id")
        .eq("user_id", userId),
      supabase
        .from("resource_files")
        .select("id,resource_id,file_size")
        .eq("user_id", userId),
    ]);
  const workspacesResult = await supabase
    .from("workspaces")
    .select("id,name")
    .eq("user_id", userId);

  const queryError =
    resourcesResult.error ??
    collectionsResult.error ??
    collectionLinksResult.error ??
    tagsResult.error ??
    tagLinksResult.error ??
    filesResult.error ??
    workspacesResult.error;
  if (queryError) {
    throw new Error(`Unable to load your library: ${queryError.message}`);
  }

  const collectionNameById = new Map(
    (collectionsResult.data ?? []).map((collection) => [
      collection.id,
      collection.name,
    ]),
  );
  const tagNameById = new Map(
    (tagsResult.data ?? []).map((tag) => [tag.id, tag.name]),
  );
  const collectionsByResource = groupRelatedNames(
    collectionLinksResult.data ?? [],
    "collection_id",
    collectionNameById,
  );
  const tagsByResource = groupRelatedNames(
    tagLinksResult.data ?? [],
    "tag_id",
    tagNameById,
  );
  const fileByResource = new Map(
    (filesResult.data ?? []).map((file) => [file.resource_id, file]),
  );
  const workspaceNameById = new Map(
    (workspacesResult.data ?? []).map((workspace) => [
      workspace.id,
      workspace.name,
    ]),
  );

  return {
    resources: (resourcesResult.data ?? []).map((row) =>
      mapResource(
        row,
        collectionsByResource,
        tagsByResource,
        fileByResource,
        workspaceNameById,
      ),
    ),
    collections: (collectionsResult.data ?? []).map(
      (collection) => collection.name,
    ),
    workspaces: (workspacesResult.data ?? []).map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      description: "",
    })),
  };
}

export async function createResource(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ResourceInput,
): Promise<Resource> {
  const resourceId = await createResourceRecordId(supabase, input);
  const library = await listResources(supabase, userId);
  const savedResource = library.resources.find(
    (resource) => resource.id === resourceId,
  );
  if (!savedResource) throw new Error("The saved resource could not be loaded.");
  return savedResource;
}

export async function createResourceRecordId(
  supabase: SupabaseClient<Database>,
  input: ResourceInput,
): Promise<string> {
  const { data: resourceId, error } = await supabase.rpc(
    "create_resource_with_relations",
    toRpcArguments(input),
  );
  if (error) throw new Error(`Unable to save resource: ${error.message}`);
  if (!resourceId) throw new Error("Resource was saved without an identifier.");
  return resourceId;
}

export async function updateResource(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
  input: ResourceInput,
): Promise<Resource> {
  const { data: existing, error: existingError } = await supabase
    .from("resources")
    .select("resource_type,file_name,mime_type,workspace_id")
    .eq("id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Unable to load resource before updating: ${existingError.message}`);
  }
  if (!existing) throw new Error("Resource not found or access denied.");

  const safeInput: ResourceInput =
    existing.resource_type === "file"
      ? {
          ...input,
          workspaceId: existing.workspace_id,
          type: existing.mime_type === "application/pdf" ? "PDF" : "Image",
          fileName: existing.file_name ?? undefined,
          mimeType: existing.mime_type ?? undefined,
        }
      : input;
  const { error } = await supabase.rpc("update_resource_with_relations", {
    p_resource_id: resourceId,
    ...toUpdateRpcArguments(safeInput),
  });
  if (error) throw new Error(`Unable to update resource: ${error.message}`);
  const library = await listResources(supabase, userId);
  const updatedResource = library.resources.find(
    (resource) => resource.id === resourceId,
  );
  if (!updatedResource) throw new Error("The updated resource could not be loaded.");
  return updatedResource;
}

export async function setResourceFavorite(
  supabase: SupabaseClient<Database>,
  resourceId: string,
  isFavorite: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from("resources")
    .update({ is_favorite: isFavorite })
    .eq("id", resourceId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Unable to update favorite: ${error.message}`);
  if (!data) throw new Error("Resource not found or access denied.");
}

export async function deleteResource(
  supabase: SupabaseClient<Database>,
  resourceId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Unable to delete resource: ${error.message}`);
  if (!data) throw new Error("Resource not found or access denied.");
}

export async function deleteResourceWithFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
): Promise<void> {
  const { data: file, error: fileError } = await supabase
    .from("resource_files")
    .select("storage_path")
    .eq("resource_id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fileError) {
    throw new Error(`Unable to load file details for deletion: ${fileError.message}`);
  }

  if (file) {
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([file.storage_path]);
    if (storageError && !isMissingStorageObject(storageError)) {
      throw new Error(
        `Unable to delete the stored file. The resource was kept: ${storageError.message}`,
      );
    }
  }

  await deleteResource(supabase, resourceId);
}

function toBaseRpcArguments(input: ResourceInput) {
  return {
    p_title: input.title,
    p_resource_type: databaseResourceType(input.type),
    p_url: input.url ?? null,
    p_content: input.content ?? null,
    p_language: input.language ?? null,
    p_file_name: input.fileName ?? null,
    p_mime_type: input.mimeType ?? null,
    p_collection_names: input.collectionNames,
    p_tags: input.tags,
  };
}

function toRpcArguments(input: ResourceInput) {
  return {
    ...toBaseRpcArguments(input),
    p_workspace_id: input.workspaceId,
  };
}

function toUpdateRpcArguments(input: ResourceInput) {
  return toBaseRpcArguments(input);
}

function databaseResourceType(
  type: ResourceType,
): "url" | "note" | "code" | "file" {
  if (type === "Link") return "url";
  if (type === "PDF" || type === "Image") return "file";
  return type === "Note" ? "note" : "code";
}

function mapResource(
  row: ResourceRow,
  collectionsByResource: Map<string, string[]>,
  tagsByResource: Map<string, string[]>,
  filesByResource: Map<
    string,
    Pick<ResourceFileRow, "id" | "resource_id" | "file_size">
  >,
  workspaceNameById: Map<string, string>,
): Resource {
  const collectionNames = collectionsByResource.get(row.id) ?? [];
  const file = filesByResource.get(row.id);
  const type = displayResourceType(row.resource_type, row.mime_type);
  const content = row.content ?? undefined;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: workspaceNameById.get(row.workspace_id) ?? "Workspace",
    title: row.title,
    type,
    collection: collectionNames[0] ?? "Unsorted",
    collectionNames,
    url: row.url ?? undefined,
    sourceName: row.file_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileId: file?.id,
    fileSize: file?.file_size,
    description: content ?? "",
    content,
    language: row.language ?? undefined,
    tags: tagsByResource.get(row.id) ?? [],
    savedAt: formatSavedAt(row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorite: row.is_favorite,
    domain: getDomain(row.url),
    preview:
      row.resource_type === "url"
        ? getDomain(row.url) ?? "SAVED LINK"
        : row.file_name ?? content?.slice(0, 90) ?? "Saved resource",
  };
}

function isMissingStorageObject(error: { statusCode?: string; message: string }) {
  return (
    error.statusCode === "404" ||
    error.message.toLowerCase().includes("not found")
  );
}

function displayResourceType(
  type: ResourceRow["resource_type"],
  mimeType: string | null,
): ResourceType {
  if (type === "url") return "Link";
  if (type === "note") return "Note";
  if (type === "code") return "Code";
  return mimeType === "application/pdf" ? "PDF" : "Image";
}

function getDomain(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function formatSavedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function groupRelatedNames<
  T extends { resource_id: string } & Record<K, string>,
  K extends string,
>(
  relations: T[],
  relationId: K,
  nameById: Map<string, string>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  relations.forEach((relation) => {
    const name = nameById.get(relation[relationId]);
    if (!name) return;
    const names = grouped.get(relation.resource_id) ?? [];
    names.push(name);
    grouped.set(relation.resource_id, names);
  });
  return grouped;
}
