"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { AuthFormState } from "@/types/auth";

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readFormString(formData, "email").toLowerCase();
  const password = readFormString(formData, "password");
  if (!isValidEmail(email) || password.length < 8) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }
  if (!isSupabaseConfigured()) return { error: supabaseSetupMessage };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "We couldn’t sign you in with those details." };
  }

  const nextPath = readFormString(formData, "next");
  redirect(isSafeRedirect(nextPath) ? nextPath : "/library");
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readFormString(formData, "email").toLowerCase();
  const password = readFormString(formData, "password");
  const confirmation = readFormString(formData, "confirm-password");
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }
  if (password !== confirmation) {
    return { error: "Those passwords don’t match. Try entering them again." };
  }
  if (!isSupabaseConfigured()) return { error: supabaseSetupMessage };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  if (data.session) redirect("/library");
  return {
    message: "Check your email for a confirmation link to finish creating your account.",
  };
}

export async function signOutAction() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
  redirect("/");
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeRedirect(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

const supabaseSetupMessage =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.";
