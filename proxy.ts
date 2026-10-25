import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { url: supabaseUrl, publishableKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims.sub);
  const isProtectedRoute = request.nextUrl.pathname.startsWith("/library");
  const isAuthRoute = ["/login", "/signup"].includes(request.nextUrl.pathname);

  if (!isAuthenticated && isProtectedRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    copySessionCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (isAuthenticated && isAuthRoute) {
    const destination = safeRedirectPath(
      request.nextUrl.searchParams.get("next"),
    );
    const redirectResponse = NextResponse.redirect(
      new URL(destination, request.url),
    );
    copySessionCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

function safeRedirectPath(path: string | null): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    return "/library";
  }
  return path;
}

function copySessionCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
}

export const config = {
  matcher: ["/library/:path*", "/login", "/signup"],
};
