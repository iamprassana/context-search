import { LibraryDashboard } from "@/components/resources/LibraryDashboard";
import { getAuthenticatedSupabaseClient } from "@/lib/supabase/authenticated";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMaxUploadSizeBytes } from "@/lib/storage/config";
import { listResources } from "@/services/resourceService";
import type { ResourceLibraryData } from "@/types/resource";

export const instant = false;

export default async function LibraryPage() {
  const maxUploadSizeBytes = getMaxUploadSizeBytes();
  if (!isSupabaseConfigured()) {
    return (
      <LibraryDashboard
        initialResources={[]}
        initialCollections={[]}
        userEmail=""
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
        userEmail={user.email ?? ""}
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
      userEmail={user.email ?? ""}
      maxUploadSizeBytes={maxUploadSizeBytes}
    />
  );
}
