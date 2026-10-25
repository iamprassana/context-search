"use client";

import {
  BookOpen,
  Bookmark,
  Clock3,
  Folder,
  Menu,
  Search,
  Settings2,
  Star,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryView, Resource } from "@/types/resource";

type SidebarProps = {
  activeView: LibraryView | string;
  collections: readonly string[];
  resources: Resource[];
  mobileOpen: boolean;
  onNavigate: (view: LibraryView | string) => void;
  onSearch: () => void;
  onToggleMobile: () => void;
};

export function Sidebar({
  activeView,
  collections,
  resources,
  mobileOpen,
  onNavigate,
  onSearch,
  onToggleMobile,
}: SidebarProps) {
  const favoritesCount = resources.filter((resource) => resource.favorite).length;

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

        <div className="workspace-switch">
          <span className="workspace-avatar">S</span>
          <span className="workspace-copy">
            <strong>Studio North</strong>
            <small>Personal workspace</small>
          </span>
        </div>

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
          </div>
          {collections.map((collection) => (
            <SidebarItem
              key={collection}
              active={activeView === collection}
              count={
                resources.filter((resource) => resource.collection === collection)
                  .length
              }
              icon={<Folder size={15} />}
              label={collection}
              onClick={() => onNavigate(collection)}
            />
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
            <span className="profile-avatar">AK</span>
            <span className="profile-copy">
              <strong>Alex Kim</strong>
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
