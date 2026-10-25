"use client";

import {
  ArrowUpRight,
  Code2,
  FileText,
  FileType2,
  Folder,
  Globe2,
  Image as ImageIcon,
  Link2,
  Star,
} from "lucide-react";
import type { Resource } from "@/types/resource";

type ResourceCardProps = {
  resource: Resource;
  onOpen: (resource: Resource) => void;
  onFavorite: (id: string) => void;
  onTagSelect: (tag: string) => void;
};

const resourceTypeStyles: Record<Resource["type"], string> = {
  Link: "link",
  Note: "note",
  Code: "code",
  Image: "image",
  PDF: "pdf",
};

const resourceTypeIcons = {
  Link: Link2,
  Note: FileText,
  Code: Code2,
  Image: ImageIcon,
  PDF: FileType2,
};

export function ResourceCard({
  resource,
  onOpen,
  onFavorite,
  onTagSelect,
}: ResourceCardProps) {
  const Icon = resourceTypeIcons[resource.type];

  return (
    <article className="resource-card">
      <button
        className="card-open"
        onClick={() => onOpen(resource)}
        aria-label={`Open ${resource.title}`}
      >
        <ResourcePreview resource={resource} />
        <div className="card-copy">
          <div className="card-title-row">
            <span className={`type-icon type-${resourceTypeStyles[resource.type]}`}>
              <Icon size={14} />
            </span>
            <h2>{resource.title}</h2>
          </div>
          <p className="card-description">{resource.description}</p>
          <div className="card-meta">
            <span className="collection-name">
              <Folder size={12} />
              {resource.collection}
            </span>
            <span className="meta-dot">·</span>
            <span>{resource.savedAt}</span>
          </div>
        </div>
      </button>
      <div className="card-footer">
        <div className="card-tags">
          {resource.tags.slice(0, 2).map((tag) => (
            <button
              key={tag}
              onClick={() => onTagSelect(tag)}
              className="resource-tag"
              aria-label={`Filter by ${tag}`}
            >
              {tag}
            </button>
          ))}
          {resource.tags.length > 2 && (
            <span className="more-tags">+{resource.tags.length - 2}</span>
          )}
        </div>
        <button
          className={`favorite-button ${resource.favorite ? "is-favorite" : ""}`}
          aria-label={
            resource.favorite ? "Remove from favorites" : "Add to favorites"
          }
          aria-pressed={resource.favorite}
          onClick={() => onFavorite(resource.id)}
        >
          <Star size={15} fill={resource.favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}

function ResourcePreview({ resource }: { resource: Resource }) {
  const style = resourceTypeStyles[resource.type];

  return (
    <div className={`resource-preview preview-${style}`}>
      {resource.type === "Link" && (
        <>
          <div className="web-preview-top">
            <span className="web-dot" />
            <span className="web-dot" />
            <span className="web-dot" />
            <span className="web-address">{resource.domain}</span>
            <ArrowUpRight size={12} />
          </div>
          <div className="web-preview-content">
            <span className="preview-kicker">{resource.preview}</span>
            <span className="web-preview-title">{resource.title}</span>
            <span className="web-preview-domain">
              <Globe2 size={11} />
              {resource.domain}
            </span>
          </div>
        </>
      )}
      {resource.type === "Note" && (
        <div className="note-preview">
          <span className="note-preview-icon">
            <FileText size={15} />
          </span>
          <span className="note-lines">
            <i />
            <i />
            <i />
          </span>
          <span className="note-preview-text">{resource.preview}</span>
        </div>
      )}
      {resource.type === "Code" && (
        <pre className="code-preview">
          <span className="code-dots">
            ● <i>●</i> <b>●</b>
          </span>
          <code>{resource.preview}</code>
        </pre>
      )}
      {resource.type === "Image" && (
        <div className="image-preview-art">
          <span className="sun-shape" />
          <span className="mountain-shape" />
          <span className="image-preview-caption">{resource.preview}</span>
        </div>
      )}
      {resource.type === "PDF" && (
        <div className="pdf-preview">
          <span className="pdf-page">
            <b>{resource.preview}</b>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="pdf-label">PDF</span>
        </div>
      )}
    </div>
  );
}
