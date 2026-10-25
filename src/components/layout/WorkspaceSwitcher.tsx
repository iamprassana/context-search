"use client";

import { Check, ChevronDown, Plus, Settings2, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/types/api.types";
import type { Workspace } from "@/types/workspace.types";

type WorkspaceSwitcherProps = {
  workspaces: readonly Workspace[];
  activeWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string) => Promise<ActionResult<Workspace>>;
  onRename: (
    workspaceId: string,
    name: string,
  ) => Promise<ActionResult<Workspace>>;
  onDelete: (workspaceId: string) => Promise<ActionResult<null>>;
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: WorkspaceSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a workspace name.");
      return;
    }
    startTransition(async () => {
      const result = renaming
        ? await onRename(activeWorkspaceId, trimmedName)
        : await onCreate(trimmedName);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      setError("");
      setCreating(false);
      setRenaming(false);
    });
  }

  function deleteActiveWorkspace() {
    if (!activeWorkspace) return;
    startTransition(async () => {
      const result = await onDelete(activeWorkspace.id);
      if (!result.success) setError(result.error);
      else setError("");
    });
  }

  return (
    <div className="workspace-switcher">
      <label className="workspace-switch" htmlFor="workspace-switcher">
        <span className="workspace-avatar">
          {activeWorkspace?.name.slice(0, 1).toUpperCase() ?? "W"}
        </span>
        <span className="workspace-copy">
          <strong>{activeWorkspace?.name ?? "Create a workspace"}</strong>
          <small>{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}</small>
        </span>
        <ChevronDown size={14} />
      </label>
      <select
        id="workspace-switcher"
        className="workspace-select"
        aria-label="Select workspace"
        value={activeWorkspaceId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <div className="workspace-actions">
        <button
          type="button"
          className="workspace-action"
          onClick={() => {
            setCreating((value) => !value);
            setRenaming(false);
            setName("");
            setError("");
          }}
        >
          <Plus size={13} /> Create
        </button>
        {activeWorkspace && (
          <>
            <button
              type="button"
              className="workspace-action"
              onClick={() => {
                setRenaming((value) => !value);
                setCreating(false);
                setName(activeWorkspace.name);
                setError("");
              }}
            >
              <Settings2 size={13} /> Rename
            </button>
            <button
              type="button"
              className="workspace-action"
              onClick={deleteActiveWorkspace}
              disabled={pending}
              aria-label={`Delete ${activeWorkspace.name}`}
            >
              <Trash2 size={13} /> Delete
            </button>
          </>
        )}
      </div>
      {(creating || renaming) && (
        <form className="workspace-name-form" onSubmit={submit}>
          <input
            aria-label="Workspace name"
            maxLength={100}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={pending} aria-label="Save workspace">
            <Check size={14} />
          </button>
        </form>
      )}
      {error && <p className="workspace-error" role="alert">{error}</p>}
    </div>
  );
}
