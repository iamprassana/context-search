import type { ResourceInput, ResourceType } from "@/types/resource";

const resourceTypes = new Set<ResourceType>([
  "Link",
  "Note",
  "Code",
  "Image",
  "PDF",
]);
const supportedFileMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateResourceInput(
  value: unknown,
): { input: ResourceInput } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Resource details are required." };
  }

  const candidate = value as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const type =
    typeof candidate.type === "string" &&
    resourceTypes.has(candidate.type as ResourceType)
      ? (candidate.type as ResourceType)
      : null;
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const content =
    typeof candidate.content === "string" ? candidate.content.trim() : "";
  const language =
    typeof candidate.language === "string"
      ? candidate.language.trim()
      : "";
  const fileName =
    typeof candidate.fileName === "string"
      ? candidate.fileName.trim()
      : "";
  const mimeType =
    typeof candidate.mimeType === "string"
      ? candidate.mimeType.trim().toLowerCase()
      : "";
  const rawCollectionNames = Array.isArray(candidate.collectionNames)
    ? candidate.collectionNames
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const rawTags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const collectionNames = Array.from(new Set(rawCollectionNames));
  const tags = Array.from(new Set(rawTags));

  if (!title || title.length > 300) {
    return { error: "Title is required and must be 300 characters or fewer." };
  }
  if (!type) {
    return { error: "Choose a supported resource type." };
  }
  if (content.length > 200_000) {
    return { error: "Content must be 200,000 characters or fewer." };
  }
  if (url.length > 2_048) {
    return { error: "URLs must be 2,048 characters or fewer." };
  }
  if (language.length > 64) {
    return { error: "Language names must be 64 characters or fewer." };
  }
  if (fileName.length > 255) {
    return { error: "File names must be 255 characters or fewer." };
  }
  if (collectionNames.length > 20) {
    return { error: "Choose no more than 20 collections." };
  }
  if (collectionNames.some((name) => name.length > 100)) {
    return { error: "Collection names must be 100 characters or fewer." };
  }
  if (tags.length > 30) {
    return { error: "Add no more than 30 tags." };
  }
  if (type === "Link" && !isHttpUrl(url)) {
    return { error: "Enter a valid URL beginning with http:// or https://." };
  }
  if ((type === "Note" || type === "Code") && !content) {
    return { error: "Add some content before saving this resource." };
  }
  if (type === "PDF" || type === "Image") {
    if (!fileName) {
      return { error: "Choose a file to upload." };
    }
    if (!supportedFileMimeTypes.has(mimeType)) {
      return { error: "Choose a PDF, JPEG, PNG, or WebP file." };
    }
    const extension = fileName.split(".").pop()?.toLowerCase();
    const validFileName =
      (mimeType === "application/pdf" && extension === "pdf") ||
      (mimeType === "image/jpeg" &&
        (extension === "jpg" || extension === "jpeg")) ||
      (mimeType === "image/png" && extension === "png") ||
      (mimeType === "image/webp" && extension === "webp");
    if (!validFileName || (type === "PDF") !== (mimeType === "application/pdf")) {
      return { error: "The file type and extension must match." };
    }
  }
  if (url && !isHttpUrl(url)) {
    return { error: "Enter a valid URL beginning with http:// or https://." };
  }
  if (tags.some((tag) => tag.length > 64)) {
    return { error: "Tags must be 64 characters or fewer." };
  }

  return {
    input: {
      title,
      type,
      collectionNames,
      url: url || undefined,
      content: content || undefined,
      language: language || undefined,
      fileName: fileName || undefined,
      mimeType: mimeType || undefined,
      tags: Array.from(new Set(tags)),
    },
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !hostname.endsWith(".lan") &&
      !hostname.endsWith(".home.arpa")
    );
  } catch {
    return false;
  }
}
