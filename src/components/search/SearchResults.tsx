"use client";

import type { Resource, ResourceLayout } from "@/types/resource";
import type { SemanticResourceMatch } from "@/types/search";
import { ResourceCard } from "@/components/resources/ResourceCard";

type SearchResultsProps = {
  matches: SemanticResourceMatch[];
  layout: ResourceLayout;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  indexing: boolean;
  indexingHasMore: boolean;
  indexingMessage: string;
  onIndexResources: () => void;
  onOpen: (resource: Resource) => void;
  onFavorite: (id: string) => void;
  onTagSelect: (tag: string) => void;
  onClear: () => void;
};

export function SearchResults({
  matches,
  layout,
  status,
  error,
  indexing,
  indexingHasMore,
  indexingMessage,
  onIndexResources,
  onOpen,
  onFavorite,
  onTagSelect,
  onClear,
}: SearchResultsProps) {
  return (
    <section aria-label="Semantic search results">
      <div className="search-results-caption">
        <div>
          <strong>
            {status === "loading"
              ? "Searching your notes, code, webpages and files…"
              : `${matches.length} semantic ${matches.length === 1 ? "match" : "matches"}`}
          </strong>
          <span>
              Results include notes, code, webpages, PDFs, and visual image
              matches. PDF matches represent the whole document, not a passage.
          </span>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={onIndexResources}
          disabled={indexing}
        >
          {indexing
            ? "Indexing…"
            : indexingHasMore
              ? "Continue indexing"
              : "Index or retry saved resources"}
        </button>
      </div>

      {indexingMessage && (
        <p className="search-status-message" role="status">
          {indexingMessage}
        </p>
      )}

      {status === "error" ? (
        <div className="empty-state" role="alert">
          <h2>Search is unavailable</h2>
          <p>{error}</p>
        </div>
      ) : status === "loading" ? (
        <div className="empty-state" role="status" aria-live="polite">
          <p>Searching notes, code, saved webpages, PDFs and images…</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="empty-state">
          <h2>No semantic matches</h2>
          <p>
            Try another query, or index saved resources. PDFs and images are
            embedded as whole files; PDF results do not identify a specific
            page or passage.
          </p>
          <button className="text-button" type="button" onClick={onClear}>
            Clear search and filters
          </button>
        </div>
      ) : (
        <div
          className={`resource-grid ${layout === "list" ? "resource-list" : ""}`}
        >
          {matches.map(({ resource, excerpt }) => (
            <article className="semantic-search-result" key={resource.id}>
              <p className="semantic-search-excerpt">{excerpt}</p>
              <ResourceCard
                resource={resource}
                onOpen={onOpen}
                onFavorite={onFavorite}
                onTagSelect={onTagSelect}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
