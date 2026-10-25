"use client";

import {
  BookOpen,
  Bookmark,
  Check,
  Clock3,
  Folder,
  Pencil,
  Plus,
  Trash2,
  Menu,
  Search,
  Settings2,
  Star,
  X,
} from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import type {
  LibraryView,
  Resource,
} from "@/types/resource.types";
import type { ActionResult } from "@/types/api.types";
import type { Workspace } from "@/types/workspace.types";

type SidebarProps = {
  activeView: LibraryView | string;
  collections: readonly string[];
  resources: Resource[];
  workspaces: readonly Workspace[];
  activeWorkspaceId: string;
  userEmail: string;
  userDisplayName: string;
  userId: string;
  mobileOpen: boolean;
  onNavigate: (view: LibraryView | string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (name: string) => Promise<ActionResult<Workspace>>;
  onRenameWorkspace: (
    workspaceId: string,
    name: string,
  ) => Promise<ActionResult<Workspace>>;
  onDeleteWorkspace: (workspaceId: string) => Promise<ActionResult<null>>;
  onCreateCollection: (name: string) => Promise<ActionResult<string>>;
  onRenameCollection: (
    oldName: string,
    name: string,
  ) => Promise<ActionResult<string>>;
  onDeleteCollection: (name: string) => Promise<ActionResult<string>>;
  onSearch: () => void;
  onToggleMobile: () => void;
};

export function Sidebar({
  activeView,
  collections,
  resources,
  workspaces,
  activeWorkspaceId,
  userEmail,
  userDisplayName,
  userId,
  mobileOpen,
  onNavigate,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onSearch,
  onToggleMobile,
}: SidebarProps) {
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [creatingPending, startCreating] = useTransition();
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const favoritesCount = resources.filter((resource) => resource.favorite).length;

  function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) {
      setCollectionError("Enter a collection name.");
      return;
    }
    startCreating(async () => {
      let result: ActionResult<string>;
      try {
        result = await onCreateCollection(name);
      } catch (error) {
        setCollectionError(
          error instanceof Error
            ? `Could not create collection: ${error.message}`
            : "Could not create collection. Please try again.",
        );
        return;
      }
      if (!result.success) {
        setCollectionError(result.error);
        return;
      }
      setCollectionName("");
      setCollectionError("");
      setCreatingCollection(false);
    });
  }

  function submitCollectionEdit(
    event: FormEvent<HTMLFormElement>,
    oldName: string,
  ) {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) {
      setCollectionError("Enter a collection name.");
      return;
    }
    startCreating(async () => {
      const result = await onRenameCollection(oldName, name);
      if (!result.success) {
        setCollectionError(result.error);
        return;
      }
      setCollectionName("");
      setCollectionError("");
      setEditingCollection(null);
    });
  }

  function deleteCollection(name: string) {
    startCreating(async () => {
      const result = await onDeleteCollection(name);
      if (!result.success) {
        setCollectionError(result.error);
        return;
      }
      setCollectionError("");
      setConfirmingDelete(null);
    });
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={onToggleMobile}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <Bookmark size={17} strokeWidth={2.4} />
          </div>
          <span className="brand-name">
            context<span>keep</span>
          </span>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={onToggleMobile}
          >
            <X size={17} />
          </button>
        </div>

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={onSelectWorkspace}
          onCreate={onCreateWorkspace}
          onRename={onRenameWorkspace}
          onDelete={onDeleteWorkspace}
        />

        <button className="sidebar-search" onClick={onSearch}>
          <Search size={15} />
          <span>Search everything</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="nav-group">
          <p className="nav-label">LIBRARY</p>
          <SidebarItem
            active={activeView === "All resources"}
            count={resources.length}
            icon={<BookOpen size={16} />}
            label="All resources"
            onClick={() => onNavigate("All resources")}
          />
          <SidebarItem
            active={activeView === "Favorites"}
            count={favoritesCount}
            icon={<Star size={16} />}
            label="Favorites"
            onClick={() => onNavigate("Favorites")}
          />
          <SidebarItem
            active={activeView === "Recently added"}
            icon={<Clock3 size={16} />}
            label="Recently added"
            onClick={() => onNavigate("Recently added")}
          />
        </div>

        <div className="nav-group collection-group">
          <div className="nav-label-row">
            <p className="nav-label">COLLECTIONS</p>
            <button
              type="button"
              className="collection-create-button"
              aria-label="Create collection"
              title="Create collection"
              onClick={() => {
                setCreatingCollection((current) => !current);
                setCollectionName("");
                setCollectionError("");
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {creatingCollection && (
            <form className="workspace-name-form" onSubmit={submitCollection}>
              <input
                aria-label="Collection name"
                maxLength={100}
                autoFocus
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
              />
              <button
                type="submit"
                disabled={creatingPending}
                aria-label="Save collection"
              >
                <Check size={14} />
              </button>
            </form>
          )}
          {collectionError && (
            <p className="workspace-error" role="alert">
              {collectionError}
            </p>
          )}
          {collections.map((collection) => (
            <div className="collection-sidebar-item" key={collection}>
              {editingCollection === collection ? (
                <form
                  className="workspace-name-form"
                  onSubmit={(event) => submitCollectionEdit(event, collection)}
                >
                  <input
                    aria-label={`Rename ${collection}`}
                    maxLength={100}
                    autoFocus
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                  />
                  <button type="submit" disabled={creatingPending} aria-label="Save collection name">
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="collection-cancel-button"
                    onClick={() => {
                      setEditingCollection(null);
                      setCollectionError("");
                    }}
                    aria-label="Cancel collection rename"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : confirmingDelete === collection ? (
                <div className="collection-delete-confirm">
                  <span>Delete “{collection}”?</span>
                  <button
                    type="button"
                    onClick={() => deleteCollection(collection)}
                    disabled={creatingPending}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="collection-cancel-button"
                    onClick={() => setConfirmingDelete(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <SidebarItem
                    active={activeView === collection}
                    count={
                      resources.filter((resource) => resource.collectionNames.includes(collection))
                        .length
                    }
                    icon={<Folder size={15} />}
                    label={collection}
                    onClick={() => onNavigate(collection)}
                  />
                  <div className="collection-row-actions">
                    <button
                      type="button"
                      aria-label={`Rename ${collection}`}
                      title={`Rename ${collection}`}
                      onClick={() => {
                        setEditingCollection(collection);
                        setCollectionName(collection);
                        setCollectionError("");
                        setConfirmingDelete(null);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${collection}`}
                      title={`Delete ${collection}`}
                      onClick={() => {
                        setConfirmingDelete(collection);
                        setCollectionError("");
                        setEditingCollection(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <SidebarItem
            active={activeView === "Settings"}
            icon={<Settings2 size={16} />}
            label="Settings"
            onClick={() => onNavigate("Settings")}
          />
          <div className="profile-row">
            <UserAvatar
              className="profile-avatar"
              email={userEmail}
              displayName={userDisplayName}
              userId={userId}
            />
            <span className="profile-copy">
              <strong>{userDisplayName || userEmail || "User"}</strong>
              <small>Personal account</small>
            </span>
          </div>
        </div>
      </aside>
      <button
        className="icon-button mobile-menu"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        onClick={onToggleMobile}
      >
        {mobileOpen ? <X size={19} /> : <Menu size={19} />}
      </button>
    </>
  );
}

function SidebarItem({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}
