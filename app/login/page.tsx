import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Sign in · ContextKeep",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  let configurationError: string | undefined;

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) redirect(isSafePath(next) ? next : "/library");
    if (error && error.name !== "AuthSessionMissingError") {
      configurationError = `Unable to verify your Supabase session: ${error.message}`;
    }
  } else {
    configurationError =
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.";
  }

  return (
    <AuthForm
      mode="login"
      nextPath={isSafePath(next) ? next : "/library"}
      configurationError={configurationError}
    />
  );
}

function isSafePath(value: string | undefined): value is string {
  return Boolean(
    value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\"),
  );
}
