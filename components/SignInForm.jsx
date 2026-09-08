"use client";

// Sign-in form. Rewritten for the App Router rather than ported from
// leadnear-main's pages/signin.jsx, which depends on next/router,
// next/legacy/image, sweetalert2 and a CSS module none of which exist here.
// Credentials only — this project has no OAuth providers configured.

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // NextAuth redirects failures back here with ?error=..., e.g. when a session
  // expires mid-request.
  const urlError = searchParams.get("error");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    // redirect:false keeps the failure on this page so the message can be shown
    // inline; NextAuth would otherwise bounce back with only a query parameter.
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.ok) {
      // Refresh so server components re-render with the new session cookie.
      router.replace(searchParams.get("callbackUrl") || "/");
      router.refresh();
      return;
    }

    // authorize() returns null for unknown email, wrong password and blocked
    // account alike, so the message stays deliberately non-specific.
    setError("Incorrect email or password.");
  }

  if (status === "authenticated") {
    return (
      <div className="auth-page">
        <h1>You are signed in</h1>
        <p>
          <Link href="/">Back to job search</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Sign in</h1>

      {(error || urlError) && (
        <p className="auth-error" role="alert">
          {error || "Could not sign you in. Please try again."}
        </p>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-alt">
        No account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
