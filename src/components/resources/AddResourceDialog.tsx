"use client";

import { FileUp, Link2, Code2, FileText, X } from "lucide-react";
import { FormEvent, useRef, useState, useTransition } from "react";
import type {
  Resource,
  ResourceCategory,
  ResourceInput,
  ResourceType,
} from "@/types/resource.types";
import type { ActionResult } from "@/types/api.types";
import type { Workspace } from "@/types/workspace.types";
import { formatFileSize } from "@/lib/storage/config";

type AddResourceDialogProps = {
  collections: readonly string[];
  workspaces: readonly Workspace[];
  initialWorkspaceId: string;
  maxUploadSizeBytes: number;
  onClose: () => void;
  onSave: (input: ResourceInput) => Promise<ActionResult<Resource>>;
  onUpload: (
    input: ResourceInput,
    file: File,
  ) => Promise<ActionResult<Resource>>;
};

const categories: { id: ResourceCategory; label: string }[] = [
  { id: "URL", label: "URL" },
  { id: "Note", label: "Note" },
  { id: "Code", label: "Code" },
  { id: "File", label: "File" },
];

export function AddResourceDialog({
  collections,
  workspaces,
  initialWorkspaceId,
  maxUploadSizeBytes,
  onClose,
  onSave,
  onUpload,
}: AddResourceDialogProps) {
  const [category, setCategory] = useState<ResourceCategory>("URL");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const language = String(form.get("language") ?? "").trim();
    const collectionNames = form
      .getAll("collection")
      .filter((value): value is string => typeof value === "string");

    if (category === "File" && !selectedFile) {
      setError("Choose an image or PDF to continue.");
      return;
    }

    const fileType = selectedFile ? getSupportedFileType(selectedFile) : null;
    if (category === "File") {
      if (!selectedFile) {
        setError("Choose a PDF, JPEG, PNG, or WebP file to continue.");
        return;
      }
      if (!fileType) {
        setError("Choose a PDF, JPEG, PNG, or WebP file with a matching extension.");
        return;
      }
      if (selectedFile.size === 0) {
        setError("The selected file is empty.");
        return;
      }
      if (selectedFile.size > maxUploadSizeBytes) {
        setError(`Files must be ${formatFileSize(maxUploadSizeBytes)} or smaller.`);
        return;
      }
    }
    const type: ResourceType =
      category === "URL"
        ? "Link"
        : category === "File"
          ? fileType ?? "Image"
          : category;
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    setError("");
    startTransition(async () => {
      const input: ResourceInput = {
        title,
        type,
        workspaceId: String(form.get("workspace") ?? initialWorkspaceId),
        collectionNames:
          category === "URL" || category === "Note" || category === "Code"
            ? collectionNames
            : [],
        url: url || undefined,
        content: category === "Note" || category === "Code" ? content : notes,
        language: category === "Code" ? language : undefined,
        fileName: category === "File" ? selectedFile?.name : undefined,
        mimeType: category === "File" && selectedFile
          ? selectedFile.type || MIME_TYPE_BY_EXTENSION[getFileExtension(selectedFile)]
          : undefined,
        tags,
      };
      const result =
        category === "File" && selectedFile
          ? await onUpload(input, selectedFile)
          : await onSave(input);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-resource-title"
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="modal-icon">
              <FileUp size={17} />
            </span>
            <div>
              <h2 id="add-resource-title">Add to your library</h2>
              <p>Save something you’ll want to find again.</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={isPending}
          >
            <X size={17} />
          </button>
        </div>

        <div className="resource-tabs" role="tablist" aria-label="Resource type">
          {categories.map(({ id, label }) => {
            const Icon =
              id === "URL" ? Link2 : id === "Code" ? Code2 : FileText;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={category === id}
                className={`resource-tab ${category === id ? "resource-tab-active" : ""}`}
                onClick={() => {
                  setCategory(id);
                  setError("");
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        <label className="form-label">
          Title
          <input
            name="title"
            placeholder={
              category === "Code"
                ? "e.g. fetchWithRetry.ts"
                : "A useful article, note, or document..."
            }
            required
            autoFocus
          />
        </label>

        {category === "URL" && (
          <>
            <WorkspaceField
              workspaces={workspaces}
              initialWorkspaceId={initialWorkspaceId}
            />
            <label className="form-label">
              URL
              <input
                name="url"
                type="url"
                placeholder="https://example.com/article"
                required
              />
            </label>
            <label className="form-label">
              Notes <span className="optional-label">optional</span>
              <textarea
                name="notes"
                rows={2}
                placeholder="What should you remember about this?"
              />
            </label>
            <CollectionField collections={collections} />
          </>
        )}

        {category === "Note" && (
          <>
            <WorkspaceField
              workspaces={workspaces}
              initialWorkspaceId={initialWorkspaceId}
            />
            <label className="form-label">
              Note
              <textarea
                name="content"
                rows={5}
                placeholder="Write down the idea you want to find later..."
                required
              />
            </label>
            <CollectionField collections={collections} />
          </>
        )}

        {category === "Code" && (
          <>
            <WorkspaceField
              workspaces={workspaces}
              initialWorkspaceId={initialWorkspaceId}
            />
            <div className="form-row">
              <label className="form-label">
                Language
                <select name="language" defaultValue="TypeScript">
                  <option>TypeScript</option>
                  <option>JavaScript</option>
                  <option>Java</option>
                  <option>Python</option>
                  <option>C</option>
                  <option>C++</option>
                  <option>SQL</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="form-label">
                Source URL <span className="optional-label">optional</span>
                <input name="url" type="url" placeholder="https://" />
              </label>
            </div>
            <label className="form-label">
              Code
              <textarea
                className="code-input"
                name="content"
                rows={6}
                placeholder="Paste a snippet worth keeping..."
                required
              />
            </label>
            <CollectionField collections={collections} />
          </>
        )}

        {category === "File" && (
          <>
            <WorkspaceField
              workspaces={workspaces}
              initialWorkspaceId={initialWorkspaceId}
            />
            <div className="form-label">
              File
              <button
                type="button"
                className="file-picker"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp size={16} />
                <span>
                  <strong>
                    {selectedFile ? selectedFile.name : "Choose an image or PDF"}
                  </strong>
                  <small>
                    {selectedFile
                      ? `${formatFileSize(selectedFile.size)} · ready to upload`
                      : `PDF, JPEG, PNG, or WebP · up to ${formatFileSize(maxUploadSizeBytes)}`}
                  </small>
                </span>
              </button>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setError("");
                }}
                aria-label="Choose an image or PDF file"
              />
            </div>
            <label className="form-label">
              Notes <span className="optional-label">optional</span>
              <textarea
                name="notes"
                rows={2}
                placeholder="Add context to help you find this later..."
              />
            </label>
          </>
        )}

        <label className="form-label">
          Tags <span className="optional-label">comma separated</span>
          <input name="tags" placeholder="e.g. design, research" />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="cancel-button"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button type="submit" className="add-button" disabled={isPending}>
            {isPending
              ? category === "File"
                ? "Uploading..."
                : "Saving..."
              : "Add resource"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CollectionField({ collections }: { collections: readonly string[] }) {
  return (
    <label className="form-label">
      Collection
      <select name="collection" defaultValue={collections[0] ?? "Inbox"} multiple>
        {collections.length === 0 && <option>Inbox</option>}
        {collections.map((collection) => (
          <option key={collection} value={collection}>
            {collection}
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkspaceField({
  workspaces,
  initialWorkspaceId,
}: {
  workspaces: readonly Workspace[];
  initialWorkspaceId: string;
}) {
  return (
    <label className="form-label">
      Workspace
      <select name="workspace" defaultValue={initialWorkspaceId} required>
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function getFileExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function getSupportedFileType(file: File): "Image" | "PDF" | null {
  const extension = getFileExtension(file);
  const expectedMimeType = MIME_TYPE_BY_EXTENSION[extension];
  if (!expectedMimeType) return null;
  if (file.type && file.type !== expectedMimeType) return null;
  return expectedMimeType === "application/pdf" ? "PDF" : "Image";
}
