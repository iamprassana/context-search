"use client";

import { Download, Eye } from "lucide-react";
import { useState, useTransition } from "react";
import { createResourceFileLinksAction } from "../../../app/actions/resources";
import { formatFileSize } from "@/lib/storage/config";
import type { ResourceFileLinks, ResourceType } from "@/types/resource";

type ResourceFileAccessProps = {
  resourceId: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  type: ResourceType;
};

export function ResourceFileAccess({
  resourceId,
  fileId,
  fileName,
  fileSize,
  type,
}: ResourceFileAccessProps) {
  const [links, setLinks] = useState<ResourceFileLinks | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function loadFileLinks() {
    setError("");
    startTransition(async () => {
      const result = await createResourceFileLinksAction(resourceId);
      if (result.success) {
        setLinks(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  if (!fileId) {
    return (
      <p className="detail-source">
        No uploaded file is attached to this resource.
      </p>
    );
  }

  return (
    <section className="resource-file-access" aria-label="File preview and download">
      <div className="resource-file-actions">
        <span className="detail-source">
          {fileName ?? "Uploaded file"}
          {typeof fileSize === "number" && ` · ${formatFileSize(fileSize)}`}
        </span>
        <button
          className="cancel-button"
          type="button"
          onClick={loadFileLinks}
          disabled={isPending}
        >
          <Eye size={14} />
          {isPending ? "Preparing..." : links ? "Refresh preview" : "Preview"}
        </button>
        {links && (
          <a
            className="cancel-button"
            href={links.downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
            Download
          </a>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {links && (
        <iframe
          className="resource-file-frame"
          src={links.previewUrl}
          title={`${type} preview: ${fileName ?? "uploaded file"}`}
        />
      )}
    </section>
  );
}
