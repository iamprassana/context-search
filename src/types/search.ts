import type { Resource } from "@/types/resource";

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
