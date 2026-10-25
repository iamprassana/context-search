"use client";

import { ChevronDown, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "../../../app/actions/auth";
import { UserAvatar } from "@/components/layout/UserAvatar";

type LibraryHeaderProps = {
  activeView: string;
  userEmail: string;
  userDisplayName: string;
  userId: string;
  addDisabled?: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onAddResource: () => void;
};

export function LibraryHeader({
  activeView,
  userEmail,
  userDisplayName,
  userId,
  addDisabled = false,
  query,
  onQueryChange,
  onAddResource,
}: LibraryHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Library</span>
        <span className="crumb-slash">/</span>
        <strong>{activeView}</strong>
      </div>
      <label className="topbar-search">
        <Search size={16} aria-hidden="true" />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your library..."
          aria-label="Search your library"
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="topbar-actions">
        <button
          className="add-button"
          onClick={onAddResource}
          disabled={addDisabled}
        >
          <Plus size={16} />
          <span>Add resource</span>
        </button>
        <div className="user-menu-anchor" ref={userMenuRef}>
          <button
            className="user-menu-button"
            aria-label={`Open account menu for ${userEmail || userDisplayName || "user"}`}
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <UserAvatar
              className="user-menu-avatar"
              email={userEmail}
              displayName={userDisplayName}
              userId={userId}
            />
            <ChevronDown size={14} />
          </button>
          {userMenuOpen && (
            <div className="user-menu-popover">
              <p>{userEmail}</p>
              <small>Signed in with Supabase</small>
              <form action={signOutAction}>
                <button type="submit">Sign out</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
