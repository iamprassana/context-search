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
    <section aria-label="Search results">
      <div className="search-results-caption">
        <div>
          <strong>
            {status === "loading"
              ? "Searching your notes, code, webpages and files…"
              : `${matches.length} relevant ${matches.length === 1 ? "match" : "matches"}`}
          </strong>
          <span>
            Results combine semantic relevance and exact or full-text matches
            across notes, code, webpages, PDFs, and images.
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
          <h2>No relevant matches</h2>
          <p>
            Try another query or index saved resources. Search only shows
            resources that pass the relevance checks or match your keywords.
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
              {resource.type === "Code" && resource.language && (
                <span className="semantic-search-language">
                  {resource.language}
                </span>
              )}
              {resource.type === "Code" ? (
                <pre className="semantic-search-excerpt semantic-search-code">
                  <code>{excerpt}</code>
                </pre>
              ) : (
                <p className="semantic-search-excerpt">{excerpt}</p>
              )}
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
