"use client";

// Registration form. Posts to /api/register, then signs the new account in
// immediately so the user is not asked for the same password twice.

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    // Checked here for a fast message and again in the route handler, which is
    // the boundary that actually has to hold.
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    const response = await fetch("/jobs/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || "Could not create the account.");
      setSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setSubmitting(false);

    if (result?.ok) {
      router.replace("/");
      router.refresh();
    } else {
      // The account exists even though the automatic sign-in did not take.
      router.replace("/signin");
    }
  }

  return (
    <div className="auth-page">
      <h1>Create an account</h1>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="name">Name</label>
        <input id="name" type="text" value={form.name} autoComplete="name" onChange={update("name")} />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={form.email}
          autoComplete="email"
          required
          onChange={update("email")}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={form.password}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          onChange={update("password")}
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="auth-alt">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </div>
  );
}
