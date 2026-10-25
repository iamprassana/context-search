import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { STORAGE_BUCKET } from "@/lib/storage/config";
import { verifyUploadedFile } from "@/lib/storage/validate-file";
import type { Resource, ResourceInput } from "@/types/resource.types";
import type { ResourceFileLinks } from "@/types/file.types";
import {
  createResourceRecordId,
  listResources,
} from "@/services/resourceService";

export async function uploadResourceFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ResourceInput,
  file: File,
  maxFileSizeBytes: number,
): Promise<Resource> {
  const verified = await verifyUploadedFile(file, maxFileSizeBytes);
  if (input.type !== verified.resourceType) {
    throw new Error("The selected resource type does not match the file content.");
  }

  const originalFilename = file.name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!originalFilename || originalFilename.length > 255) {
    throw new Error("File names must be between 1 and 255 characters.");
  }

  const resourceInput: ResourceInput = {
    ...input,
    type: verified.resourceType,
    fileName: originalFilename,
    mimeType: verified.mimeType,
  };
  const resourceId = await createResourceRecordId(supabase, resourceInput);
  const storagePath = `${userId}/${resourceId}/${crypto.randomUUID()}.${verified.extension}`;
  let objectMayExist = false;

  try {
    objectMayExist = true;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: verified.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`Unable to upload file: ${uploadError.message}`);
    }

    const { data: fileRecord, error: metadataError } = await supabase
      .from("resource_files")
      .insert({
        resource_id: resourceId,
        user_id: userId,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: verified.mimeType,
        file_size: file.size,
      })
      .select("id")
      .single();
    if (metadataError) {
      throw new Error(
        `File uploaded but metadata could not be saved: ${metadataError.message}`,
      );
    }

    const library = await listResources(supabase, userId);
    const resource = library.resources.find(
      (item) => item.id === resourceId,
    );
    if (!resource) throw new Error("The uploaded resource could not be loaded.");

    return {
      ...resource,
      fileId: fileRecord.id,
      fileSize: file.size,
      mimeType: verified.mimeType,
      sourceName: originalFilename,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "The file upload failed unexpectedly.";
    const cleanupProblems = await rollbackUpload(
      supabase,
      userId,
      resourceId,
      storagePath,
      objectMayExist,
    );
    if (cleanupProblems.length > 0) {
      throw new Error(
        `${reason} Cleanup was incomplete: ${cleanupProblems.join("; ")}`,
      );
    }
    throw new Error(`${reason} The incomplete resource was removed.`);
  }
}

export async function createResourceFileLinks(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
): Promise<ResourceFileLinks> {
  const { data: file, error: fileError } = await supabase
    .from("resource_files")
    .select("storage_path,original_filename")
    .eq("resource_id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fileError) {
    throw new Error(`Unable to load file details: ${fileError.message}`);
  }
  if (!file) throw new Error("No file is attached to this resource.");

  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const [preview, download] = await Promise.all([
    bucket.createSignedUrl(file.storage_path, 300),
    bucket.createSignedUrl(file.storage_path, 300, {
      download: file.original_filename,
    }),
  ]);
  if (preview.error) {
    throw new Error(`Unable to create file preview: ${preview.error.message}`);
  }
  if (download.error) {
    throw new Error(`Unable to create download link: ${download.error.message}`);
  }

  return {
    previewUrl: preview.data.signedUrl,
    downloadUrl: download.data.signedUrl,
  };
}

async function rollbackUpload(
  supabase: SupabaseClient<Database>,
  userId: string,
  resourceId: string,
  storagePath: string,
  objectMayExist: boolean,
): Promise<string[]> {
  const problems: string[] = [];
  if (objectMayExist) {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);
    if (error && !isMissingStorageObject(error)) {
      problems.push(`stored file could not be removed: ${error.message}`);
    }
  }

  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    problems.push(`resource record could not be removed: ${error.message}`);
  } else if (!data) {
    problems.push("resource record was not found during cleanup");
  }
  return problems;
}

function isMissingStorageObject(error: { statusCode?: string; message: string }) {
  return (
    error.statusCode === "404" ||
    error.message.toLowerCase().includes("not found")
  );
}
