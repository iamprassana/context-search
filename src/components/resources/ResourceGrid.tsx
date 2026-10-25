"use client";

import { Search } from "lucide-react";
import type { Resource, ResourceLayout } from "@/types/resource";
import { ResourceCard } from "@/components/resources/ResourceCard";

type ResourceGridProps = {
  resources: Resource[];
  layout: ResourceLayout;
  onOpen: (resource: Resource) => void;
  onFavorite: (id: string) => void;
  onTagSelect: (tag: string) => void;
  onClearFilters: () => void;
  emptyDescription: string;
};

export function ResourceGrid({
  resources,
  layout,
  onOpen,
  onFavorite,
  onTagSelect,
  onClearFilters,
  emptyDescription,
}: ResourceGridProps) {
  if (resources.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">
          <Search size={20} />
        </span>
        <h2>No resources found</h2>
        <p>{emptyDescription}</p>
        <button className="text-button" onClick={onClearFilters}>
          Clear search and filters
        </button>
      </div>
    );
  }

  return (
    <div className={`resource-grid ${layout === "list" ? "resource-list" : ""}`}>
      {resources.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          onOpen={onOpen}
          onFavorite={onFavorite}
          onTagSelect={onTagSelect}
        />
      ))}
    </div>
  );
}
