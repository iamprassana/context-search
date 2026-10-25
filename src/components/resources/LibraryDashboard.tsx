"use client";

import {
  createResourceAction,
  uploadResourceFileAction,
  deleteResourceAction,
  setFavoriteAction,
  updateResourceAction,
} from "../../../app/actions/resources";
import {
  indexResourcesBatchAction,
  searchResourcesAction,
} from "../../../app/actions/search";
import {
  ArrowDownWideNarrow,
  ChevronDown,
  Filter,
  Grid2X2,
  List,
  Tag,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LibraryHeader } from "@/components/layout/LibraryHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { AddResourceDialog } from "@/components/resources/AddResourceDialog";
import { ResourceDetailPanel } from "@/components/resources/ResourceDetailPanel";
import { ResourceGrid } from "@/components/resources/ResourceGrid";
import { SearchResults } from "@/components/search/SearchResults";
import type {
  SemanticResourceMatch,
  SemanticSearchMatch,
} from "@/types/search";
import type {
  ActionResult,
  LibraryView,
  Resource,
  ResourceFilter,
  ResourceInput,
  ResourceLayout,
} from "@/types/resource";
import { useRouter } from "next/navigation";

export function LibraryDashboard({
  initialResources,
  initialCollections,
  userEmail,
  userDisplayName,
  userId,
  maxUploadSizeBytes,
  initialError,
}: {
  initialResources: Resource[];
  initialCollections: string[];
  userEmail: string;
  userDisplayName: string;
  userId: string;
  maxUploadSizeBytes: number;
  initialError?: string;
}) {
  const router = useRouter();
  const [resources, setResources] = useState(initialResources);
  const [collections, setCollections] = useState(initialCollections);
  const [activeView, setActiveView] = useState<LibraryView | string>(
    "All resources",
  );
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{
    key: string;
    status: "loading" | "ready" | "error";
    results: SemanticSearchMatch[];
    error: string;
  } | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const searchSequence = useRef(0);
  const [indexCursor, setIndexCursor] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexingHasMore, setIndexingHasMore] = useState(false);
  const [indexingMessage, setIndexingMessage] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [typeFilter, setTypeFilter] = useState<ResourceFilter>("All types");
  const [layout, setLayout] = useState<ResourceLayout>("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [actionError, setActionError] = useState("");

  const selectedResource =
    resources.find((resource) => resource.id === selectedId) ?? null;
  const focusSearch = useCallback(() => {
    setMobileNavOpen(false);
    window.setTimeout(
      () => document.getElementById("global-search")?.focus(),
      0,
    );
  }, []);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setAddDialogOpen(false);
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [focusSearch]);

  const baseResources = useMemo(() => {
    const filtered = resources.filter((resource) => {
      const matchesView =
        activeView === "All resources" ||
        activeView === "Settings" ||
        (activeView === "Favorites"
          ? resource.favorite
          : activeView === "Recently added"
            ? ["Today", "Yesterday", "Just now"].includes(resource.savedAt)
            : resource.collection === activeView);
      const matchesTag = !activeTag || resource.tags.includes(activeTag);
      const matchesType =
        typeFilter === "All types" || resource.type === typeFilter;
      return matchesView && matchesTag && matchesType;
    });
    return newestFirst ? filtered : [...filtered].reverse();
  }, [activeTag, activeView, newestFirst, resources, typeFilter]);

  const normalizedQuery = query.trim();
  const isSearching = normalizedQuery.length > 0;
  const searchKey = `${searchRevision}:${normalizedQuery}`;
  const currentSearch = searchState?.key === searchKey ? searchState : null;
  const searchStatus = currentSearch?.status ?? (isSearching ? "loading" : "ready");

  useEffect(() => {
    const sequence = ++searchSequence.current;
    const nextQuery = query.trim();

    if (!nextQuery) return;
    const key = `${searchRevision}:${nextQuery}`;

    const timeout = window.setTimeout(async () => {
      setSearchState({ key, status: "loading", results: [], error: "" });
      try {
        const result = await searchResourcesAction(nextQuery);
        if (sequence !== searchSequence.current) return;

        if (result.success) {
          setSearchState({
            key,
            status: "ready",
            results: result.data,
            error: "",
          });
        } else {
          setSearchState({
            key,
            status: "error",
            results: [],
            error: result.error,
          });
        }
      } catch (error) {
        if (sequence !== searchSequence.current) return;
        setSearchState({
          key,
          status: "error",
          results: [],
          error:
            error instanceof Error
              ? error.message
              : "Search failed unexpectedly. Please try again.",
        });
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      searchSequence.current += 1;
    };
  }, [query, searchRevision]);

  const semanticMatches = useMemo<SemanticResourceMatch[]>(() => {
    if (!currentSearch || currentSearch.status !== "ready") return [];
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const visibleIds = new Set(baseResources.map((resource) => resource.id));
    return currentSearch.results.flatMap((match) => {
      const resource = resourcesById.get(match.resourceId);
      return resource && visibleIds.has(resource.id)
        ? [{ resource, excerpt: match.excerpt }]
        : [];
    });
  }, [baseResources, currentSearch, resources]);

  const visibleResources = isSearching
    ? semanticMatches.map((match) => match.resource)
    : baseResources;
  const popularTags = useMemo(
    () =>
      Array.from(new Set(resources.flatMap((resource) => resource.tags))).slice(
        0,
        3,
      ),
    [resources],
  );
  const activeTags = activeTag ? [activeTag] : popularTags;

  function clearFilters() {
    setQuery("");
    setActiveTag("");
    setTypeFilter("All types");
    setActiveView("All resources");
  }

  async function indexMoreResources() {
    setIndexing(true);
    setIndexingMessage("");
    let result;
    try {
      result = await indexResourcesBatchAction(indexCursor);
    } catch (error) {
      setIndexing(false);
      setIndexingMessage(
        error instanceof Error
          ? error.message
          : "Indexing failed unexpectedly. Please try again.",
      );
      return;
    }
    setIndexing(false);

    if (!result.success) {
      setIndexingMessage(result.error);
      return;
    }

    const report = result.data;
    setIndexCursor(report.nextCursor);
    setIndexingHasMore(report.nextCursor !== null);
    const details = report.failures
      .map(({ title, message }) => `${title}: ${message}`)
      .join(" · ");
    setIndexingMessage(
      `Batch complete: ${report.indexed} indexed, ${report.skipped} already current, ${report.failed} failed.${details ? ` ${details}` : ""}`,
    );
    setSearchRevision((revision) => revision + 1);
  }

  async function toggleFavorite(
    id: string,
    favorite = !resources.find((resource) => resource.id === id)?.favorite,
  ): Promise<ActionResult<null>> {
    const result = await setFavoriteAction(id, favorite);
    if (result.success) {
      setResources((current) =>
        current.map((resource) =>
          resource.id === id ? { ...resource, favorite } : resource,
        ),
      );
      setActionError("");
    } else {
      setActionError(result.error);
    }
    return result;
  }

  async function addResource(
    input: ResourceInput,
  ): Promise<ActionResult<Resource>> {
    const result = await createResourceAction(input);
    if (!result.success) return result;
    setResources((current) => [result.data, ...current]);
    setCollections((current) =>
      Array.from(
        new Set([...current, ...result.data.collectionNames]),
      ),
    );
    setActiveView("All resources");
    setActiveTag("");
    setTypeFilter("All types");
    setQuery("");
    setAddDialogOpen(false);
    setActionError(result.warning ?? "");
    return result;
  }

  async function uploadFileResource(
    input: ResourceInput,
    file: File,
  ): Promise<ActionResult<Resource>> {
    const result = await uploadResourceFileAction(input, file);
    if (!result.success) return result;
    setResources((current) => [result.data, ...current]);
    setCollections((current) =>
      Array.from(new Set([...current, ...result.data.collectionNames])),
    );
    setActiveView("All resources");
    setActiveTag("");
    setTypeFilter("All types");
    setQuery("");
    setAddDialogOpen(false);
    setActionError(result.warning ?? "");
    return result;
  }

  async function updateResource(
    id: string,
    input: ResourceInput,
  ): Promise<ActionResult<Resource>> {
    const result = await updateResourceAction(id, input);
    if (!result.success) return result;
    setResources((current) =>
      current.map((resource) =>
        resource.id === result.data.id ? result.data : resource,
      ),
    );
    setCollections((current) =>
      Array.from(new Set([...current, ...result.data.collectionNames])),
    );
    setActionError(result.warning ?? "");
    return result;
  }

  async function deleteResource(id: string): Promise<ActionResult<null>> {
    const result = await deleteResourceAction(id);
    if (!result.success) return result;
    setResources((current) => current.filter((resource) => resource.id !== id));
    setSelectedId(null);
    setActionError("");
    return result;
  }

  const heading =
    activeView === "All resources" ? "Your library" : activeView;
  const resultLabel = `${visibleResources.length} ${visibleResources.length === 1 ? "resource" : "resources"}`;

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        collections={collections}
        resources={resources}
        userEmail={userEmail}
        userDisplayName={userDisplayName}
        userId={userId}
        mobileOpen={mobileNavOpen}
        onNavigate={(view) => {
          setActiveView(view);
          setMobileNavOpen(false);
        }}
        onSearch={focusSearch}
        onToggleMobile={() => setMobileNavOpen((open) => !open)}
      />
      <main className="main-area">
        <LibraryHeader
          activeView={activeView}
          userEmail={userEmail}
          userDisplayName={userDisplayName}
          userId={userId}
          addDisabled={Boolean(initialError)}
          query={query}
          onQueryChange={setQuery}
          onAddResource={() => setAddDialogOpen(true)}
        />
        <div className="content-area">
          {actionError && (
            <div className="backend-error compact-error" role="alert">
              <span>{actionError}</span>
              <button onClick={() => setActionError("")}>Dismiss</button>
            </div>
          )}
          {initialError ? (
            <section className="library-error-state" role="alert">
              <h1>Your library couldn’t load</h1>
              <p>{initialError}</p>
              <button className="add-button" onClick={() => router.refresh()}>
                Try again
              </button>
            </section>
          ) : activeView === "Settings" ? (
            <section className="settings-view">
              <p className="eyebrow">WORKSPACE</p>
              <h1>Settings</h1>
              <p className="settings-intro">
                A few local display preferences for this preview.
              </p>
              <label className="setting-row">
                <span>
                  <strong>Compact resource cards</strong>
                  <small>Reduce vertical space in the library grid.</small>
                </span>
                <input
                  type="checkbox"
                  checked={compactCards}
                  onChange={(event) => setCompactCards(event.target.checked)}
                />
              </label>
              <p className="settings-note">
                Account and sync settings will be available when a backend is
                connected.
              </p>
            </section>
          ) : (
            <>
              <section className="library-heading">
                <div className="heading-copy">
                  <p className="eyebrow">
                    {activeView === "All resources"
                      ? "YOUR PERSONAL LIBRARY"
                      : "COLLECTION"}
                  </p>
                  <div className="title-row">
                    <h1>{heading}</h1>
                    <span className="heading-count">{resultLabel}</span>
                  </div>
                  <p className="heading-description">
                    {isSearching
                      ? "Searching indexed notes and code in your library."
                      : "A home for the things worth finding again."}
                  </p>
                </div>
                <div className="library-summary" aria-label="Library summary">
                  <span>
                    <strong>{resources.length}</strong> saved
                  </span>
                  <span className="meta-dot">·</span>
                  <span>
                    <strong>{collections.length}</strong> collections
                  </span>
                </div>
              </section>

              <div className="toolbar">
                <div className="filter-row">
                  <label className="filter-button selected-filter">
                    <Filter size={14} />
                    <select
                      aria-label="Filter by resource type"
                      value={typeFilter}
                      onChange={(event) =>
                        setTypeFilter(event.target.value as ResourceFilter)
                      }
                    >
                      <option>All types</option>
                      <option>Link</option>
                      <option>Note</option>
                      <option>Code</option>
                      <option>Image</option>
                      <option>PDF</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <span className="toolbar-divider" />
                  {activeTags.map((tag) => (
                    <button
                      key={tag}
                      className={`tag-filter ${activeTag === tag ? "tag-active" : ""}`}
                      onClick={() =>
                        setActiveTag(activeTag === tag ? "" : tag)
                      }
                    >
                      <Tag size={12} />
                      {tag}
                    </button>
                  ))}
                  {activeTag && (
                    <button
                      className="clear-filter"
                      onClick={() => setActiveTag("")}
                    >
                      <X size={12} />
                      Clear
                    </button>
                  )}
                </div>
                <div className="view-controls">
                  <button
                    className="sort-button"
                    onClick={() => setNewestFirst((value) => !value)}
                  >
                    <ArrowDownWideNarrow size={14} />
                    <span>{newestFirst ? "Newest" : "Oldest"}</span>
                    <ChevronDown size={12} />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    className={`view-button ${layout === "grid" ? "view-active" : ""}`}
                    aria-label="Grid view"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <Grid2X2 size={15} />
                  </button>
                  <button
                    className={`view-button ${layout === "list" ? "view-active" : ""}`}
                    aria-label="List view"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>

              <div className={compactCards ? "compact-cards" : undefined}>
                {isSearching ? (
                  <SearchResults
                    matches={semanticMatches}
                    layout={layout}
                    status={searchStatus}
                    error={currentSearch?.error ?? ""}
                    indexing={indexing}
                    indexingHasMore={indexingHasMore}
                    indexingMessage={indexingMessage}
                    onIndexResources={() => void indexMoreResources()}
                    onOpen={(resource) => setSelectedId(resource.id)}
                    onFavorite={(id) => {
                      void toggleFavorite(id);
                    }}
                    onTagSelect={setActiveTag}
                    onClear={clearFilters}
                  />
                ) : (
                  <ResourceGrid
                    resources={visibleResources}
                    layout={layout}
                    onOpen={(resource) => setSelectedId(resource.id)}
                    onFavorite={(id) => {
                      void toggleFavorite(id);
                    }}
                    onTagSelect={setActiveTag}
                    onClearFilters={clearFilters}
                    emptyDescription={
                      activeView === "Favorites"
                        ? "Favorite a resource to keep it close at hand."
                        : "Add a resource to start building a library you can search."
                    }
                  />
                )}
              </div>
              <footer className="library-footer">
                <span>
                  Showing {visibleResources.length} of {resources.length}{" "}
                  resources
                </span>
                <span>Saved to your account</span>
              </footer>
            </>
          )}
        </div>
      </main>

      {addDialogOpen && (
        <AddResourceDialog
          collections={collections}
          maxUploadSizeBytes={maxUploadSizeBytes}
          onClose={() => setAddDialogOpen(false)}
          onSave={addResource}
          onUpload={uploadFileResource}
        />
      )}
      {selectedResource && (
        <ResourceDetailPanel
          resource={selectedResource}
          collections={collections}
          onClose={() => setSelectedId(null)}
          onFavorite={toggleFavorite}
          onUpdate={updateResource}
          onDelete={deleteResource}
          onTagSelect={(tag) => {
            setActiveTag(tag);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
