import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthenticatedSupabaseClient(
  redirectWhenUnauthenticated = true,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (redirectWhenUnauthenticated) redirect("/login?next=/library");
    throw new Error("Your session has expired. Sign in again to continue.");
  }

  return { supabase, user };
}
