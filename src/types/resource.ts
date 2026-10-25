export const RESOURCE_TYPES = ["Link", "Note", "Code", "Image", "PDF"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceCategory = "URL" | "Note" | "Code" | "File";
export type LibraryView =
  | "All resources"
  | "Favorites"
  | "Recently added"
  | "Settings";
export type ResourceFilter = "All types" | ResourceType;
export type ResourceLayout = "grid" | "list";

export type Resource = {
  id: string;
  title: string;
  type: ResourceType;
  collection: string;
  collectionNames: string[];
  url?: string;
  sourceName?: string;
  mimeType?: string;
  fileId?: string;
  fileSize?: number;
  description: string;
  content?: string;
  language?: string;
  tags: string[];
  savedAt: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  domain?: string;
  preview: string;
};

export type ResourceInput = {
  title: string;
  type: ResourceType;
  collectionNames: string[];
  url?: string;
  content?: string;
  language?: string;
  fileName?: string;
  mimeType?: string;
  tags: string[];
};

export type ResourceLibraryData = {
  resources: Resource[];
  collections: string[];
};

export type ResourceFileLinks = {
  previewUrl: string;
  downloadUrl: string;
};

export type ActionResult<T> =
  | { success: true; data: T; warning?: string }
  | { success: false; error: string };
