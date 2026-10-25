import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; the root Proxy refreshes sessions.
        }
      },
    },
  });
}
