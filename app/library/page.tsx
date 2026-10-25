import { LibraryDashboard } from "@/components/resources/LibraryDashboard";
import { connection } from "next/server";
import { getAuthenticatedSupabaseClient } from "@/lib/supabase/authenticated";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMaxUploadSizeBytes } from "@/lib/storage/config";
import { listResources } from "@/services/resourceService";
import type { ResourceLibraryData } from "@/types/resource.types";

export const instant = false;

export default async function LibraryPage() {
  await connection();
  const maxUploadSizeBytes = getMaxUploadSizeBytes();
  if (!isSupabaseConfigured()) {
    return (
      <LibraryDashboard
        initialResources={[]}
        initialCollections={[]}
        initialWorkspaces={[]}
        userEmail=""
        userDisplayName=""
        userId=""
        maxUploadSizeBytes={maxUploadSizeBytes}
        initialError="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then apply the migration in supabase/migrations."
      />
    );
  }

  const { supabase, user } = await getAuthenticatedSupabaseClient();
  let library: ResourceLibraryData;
  try {
    library = await listResources(supabase, user.id);
  } catch (error) {
    return (
      <LibraryDashboard
        initialResources={[]}
        initialCollections={[]}
        initialWorkspaces={[]}
        userEmail={user.email ?? ""}
        userDisplayName={getUserDisplayName(user.user_metadata)}
        userId={user.id}
        maxUploadSizeBytes={maxUploadSizeBytes}
        initialError={
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while loading resources."
        }
      />
    );
  }

  return (
    <LibraryDashboard
      initialResources={library.resources}
      initialCollections={library.collections}
      initialWorkspaces={library.workspaces}
      userEmail={user.email ?? ""}
      userDisplayName={getUserDisplayName(user.user_metadata)}
      userId={user.id}
      maxUploadSizeBytes={maxUploadSizeBytes}
    />
  );
}

function getUserDisplayName(metadata: Record<string, unknown>): string {
  for (const key of ["full_name", "name", "display_name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
