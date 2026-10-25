"use client";

import { ArrowLeft, Bookmark, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction, signUpAction } from "../../../app/actions/auth";
import type { AuthFormState } from "@/types/auth";

type AuthMode = "login" | "signup";

export function AuthForm({
  mode,
  nextPath = "/library",
  configurationError,
}: {
  mode: AuthMode;
  nextPath?: string;
  configurationError?: string;
}) {
  const isSignup = mode === "signup";
  const [passwordVisible, setPasswordVisible] = useState(false);
  const action = isSignup ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    {},
  );

  return (
    <main className="auth-page">
      <Link className="auth-back-link" href="/">
        <ArrowLeft size={15} />
        Back to ContextKeep
      </Link>
      <section className="auth-card">
        <Link href="/" className="auth-brand" aria-label="ContextKeep home">
          <span className="brand-mark">
            <Bookmark size={17} strokeWidth={2.4} />
          </span>
          <span className="brand-name">
            context<span>keep</span>
          </span>
        </Link>
        <div className="auth-heading">
          <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p>
            {isSignup
              ? "Start keeping the things worth finding again."
              : "Sign in to return to your personal library."}
          </p>
        </div>
        <form className="auth-form" action={formAction}>
          <input type="hidden" name="next" value={nextPath} />
          <label className="form-label">
            Email
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="form-label">
            Password
            <span className="password-input-wrap">
              <input
                name="password"
                type={passwordVisible ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={8}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
          {isSignup && (
            <label className="form-label">
              Confirm password
              <input
                name="confirm-password"
                type={passwordVisible ? "text" : "password"}
                placeholder="Enter your password again"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}
          {configurationError && (
            <p className="form-error" role="alert">
              {configurationError}
            </p>
          )}
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className="form-notice" role="status">
              {state.message}
            </p>
          )}
          <button
            className="auth-submit"
            type="submit"
            disabled={pending || Boolean(configurationError)}
          >
            {pending
              ? isSignup
                ? "Creating account..."
                : "Signing in..."
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to ContextKeep?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <p className="auth-preview-note">
          {configurationError
            ? "Resolve the error above to continue with authentication."
            : "Authentication is handled securely by Supabase."}
        </p>
      </section>
    </main>
  );
}
