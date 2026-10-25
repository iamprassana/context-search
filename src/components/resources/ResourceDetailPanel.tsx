"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Code2,
  FileText,
  FileType2,
  Folder,
  Image as ImageIcon,
  Link2,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { ResourceFileAccess } from "@/components/resources/ResourceFileAccess";
import type {
  ActionResult,
  Resource,
  ResourceInput,
  ResourceType,
  Workspace,
} from "@/types/resource";

type ResourceDetailPanelProps = {
  resource: Resource;
  collections: readonly string[];
  workspaces: readonly Workspace[];
  onClose: () => void;
  onFavorite: (id: string, favorite: boolean) => Promise<ActionResult<null>>;
  onUpdate: (
    id: string,
    input: ResourceInput,
  ) => Promise<ActionResult<Resource>>;
  onDelete: (id: string) => Promise<ActionResult<null>>;
  onMove: (
    id: string,
    workspaceId: string,
  ) => Promise<ActionResult<null>>;
  onTagSelect: (tag: string) => void;
};

const typeIcons: Record<ResourceType, typeof Link2> = {
  Link: Link2,
  Note: FileText,
  Code: Code2,
  Image: ImageIcon,
  PDF: FileType2,
};

const typeStyles: Record<ResourceType, string> = {
  Link: "link",
  Note: "note",
  Code: "code",
  Image: "image",
  PDF: "pdf",
};

export function ResourceDetailPanel({
  resource,
  collections,
  workspaces,
  onClose,
  onFavorite,
  onUpdate,
  onDelete,
  onMove,
  onTagSelect,
}: ResourceDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const Icon = typeIcons[resource.type];

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const collectionSelect = event.currentTarget.elements.namedItem(
      "collection",
    ) as HTMLSelectElement | null;
    const input: ResourceInput = {
      title: String(form.get("title") ?? "").trim(),
      type: resource.type,
      workspaceId: resource.workspaceId,
      collectionNames: collectionSelect
        ? Array.from(collectionSelect.selectedOptions, (option) => option.value)
        : resource.collectionNames,
      url: String(form.get("url") ?? "").trim() || undefined,
      content: String(form.get("content") ?? "").trim() || undefined,
      language: String(form.get("language") ?? "").trim() || undefined,
      fileName: resource.sourceName,
      mimeType: resource.mimeType,
      tags: String(form.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    };
    setError("");
    startTransition(async () => {
      const result = await onUpdate(resource.id, input);
      if (result.success) {
        setEditing(false);
      } else {
        setError(result.error);
      }
    });
  }

  function handleFavorite() {
    setError("");
    startTransition(async () => {
      const result = await onFavorite(resource.id, !resource.favorite);
      if (!result.success) setError(result.error);
    });
  }

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await onDelete(resource.id);
      if (!result.success) setError(result.error);
    });
  }

  function handleMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const workspaceId = String(form.get("workspace") ?? "");
    if (workspaceId === resource.workspaceId) return;
    setError("");
    startTransition(async () => {
      const result = await onMove(resource.id, workspaceId);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div
      className="detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-detail-title"
      >
        <div className="detail-toolbar">
          <button className="back-button" onClick={onClose}>
            <ArrowLeft size={15} />
            Library
          </button>
          <div>
            <button
              className={`favorite-button detail-favorite ${resource.favorite ? "is-favorite" : ""}`}
              onClick={handleFavorite}
              disabled={isPending}
              aria-label={
                resource.favorite ? "Remove from favorites" : "Add to favorites"
              }
              aria-pressed={resource.favorite}
            >
              <Star
                size={16}
                fill={resource.favorite ? "currentColor" : "none"}
              />
            </button>
            <button
              className="icon-button"
              aria-label="Close details"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="detail-content">
          <span className={`detail-type type-icon type-${typeStyles[resource.type]}`}>
            <Icon size={15} />
            {resource.type}
          </span>
          {editing ? (
            <form className="detail-edit-form" onSubmit={saveEdit}>
              <label className="form-label">
                Title
                <input name="title" defaultValue={resource.title} required />
              </label>
              {resource.type === "Link" && (
                <label className="form-label">
                  URL
                  <input
                    name="url"
                    type="url"
                    defaultValue={resource.url}
                    required
                  />
                </label>
              )}
              <label className="form-label">
                {resource.type === "Code"
                  ? "Code content"
                  : resource.type === "Note"
                    ? "Note content"
                    : "Notes"}
                <textarea
                  name="content"
                  className={resource.type === "Code" ? "code-input" : undefined}
                  defaultValue={resource.content || resource.description}
                  rows={5}
                />
              </label>
              {resource.type === "Code" && (
                <label className="form-label">
                  Language
                  <input name="language" defaultValue={resource.language} />
                </label>
              )}
              <label className="form-label">
                Collections
                <select
                  name="collection"
                  multiple
                  defaultValue={resource.collectionNames}
                  size={Math.min(Math.max(collections.length, 2), 5)}
                >
                  {collections.map((collection) => (
                    <option key={collection} value={collection}>
                      {collection}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Tags <span className="optional-label">comma separated</span>
                <input name="tags" defaultValue={resource.tags.join(", ")} />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="detail-edit-actions">
                <button type="submit" className="add-button" disabled={isPending}>
                  {isPending ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setEditing(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h2 id="resource-detail-title">{resource.title}</h2>
              {resource.url && (
                <a
                  className="detail-url"
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {resource.url}
                  <ArrowUpRight size={13} />
                </a>
              )}
              {resource.sourceName && (
                <p className="detail-source">{resource.sourceName}</p>
              )}
              <div className="detail-meta">
                <span>
                  <Clock3 size={13} />
                  Saved {resource.savedAt.toLowerCase()}
                </span>
                <span>
                  <Folder size={13} />
                  {resource.workspaceName}
                </span>
              </div>
              <form className="detail-workspace-move" onSubmit={handleMove}>
                <label className="form-label">
                  Move to workspace
                  <select name="workspace" defaultValue={resource.workspaceId}>
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="cancel-button"
                  disabled={isPending || workspaces.length < 2}
                >
                  Move
                </button>
              </form>
              {(resource.type === "PDF" || resource.type === "Image") && (
                <>
                  <div className="detail-rule" />
                  <p className="detail-section-label">FILE</p>
                  <ResourceFileAccess
                    resourceId={resource.id}
                    fileId={resource.fileId}
                    fileName={resource.sourceName}
                    fileSize={resource.fileSize}
                    type={resource.type}
                  />
                </>
              )}
              {error && (
                <p className="form-error detail-error" role="alert">
                  {error}
                </p>
              )}
              <div className="detail-rule" />
              <p className="detail-section-label">NOTES & CONTENT</p>
              <p className="detail-description">
                {resource.content || resource.description || "No notes yet."}
              </p>
              {resource.type === "Code" && resource.content && (
                <pre className="detail-code">
                  <code>{resource.content}</code>
                </pre>
              )}
              <div className="detail-rule" />
              <p className="detail-section-label">TAGS</p>
              <div className="detail-tags">
                {resource.tags.map((tag) => (
                  <button key={tag} onClick={() => onTagSelect(tag)}>
                    <Tag size={12} />
                    {tag}
                  </button>
                ))}
                {resource.tags.length === 0 && (
                  <span className="detail-source">No tags added</span>
                )}
              </div>
              <div className="detail-actions">
                <button
                  className="cancel-button"
                  onClick={() => setEditing(true)}
                >
                  Edit resource
                </button>
                {!confirmDelete ? (
                  <button
                    className="delete-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <span>Delete this resource?</span>
                    <button
                      className="delete-confirm-button"
                      onClick={handleDelete}
                      disabled={isPending}
                    >
                      {isPending ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      className="cancel-delete-button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div className="detail-collection">
                <Folder size={15} />
                <span>
                  <small>IN COLLECTION</small>
                  <strong>{resource.collection}</strong>
                </span>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
