import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) return confirmationFailure(url);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return confirmationFailure(url);

  const nextPath = getSafeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(nextPath, url.origin));
}

function confirmationFailure(url: URL) {
  return NextResponse.redirect(
    new URL("/login?confirmation=failed", url.origin),
  );
}

function getSafeNextPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/library";
  }
  return path;
}
