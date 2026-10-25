import type { Resource } from "@/types/resource.types";

export type IndexBatchReport = {
  indexed: number;
  skipped: number;
  failed: number;
  failures: Array<{ title: string; message: string }>;
  nextCursor: string | null;
};

export type SemanticSearchMatch = {
  resourceId: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  type: "url" | "note" | "code" | "file";
  excerpt: string;
};

export type SemanticResourceMatch = {
  resource: Resource;
  excerpt: string;
  workspaceName: string;
};
