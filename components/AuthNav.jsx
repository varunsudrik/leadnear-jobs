"use client";

// Session-aware navbar controls, matching the original in
// jobs-portal/components/AuthNav.jsx:
//
//   signed out -> "Login",  class `nav-login`        (plain text link)
//   signed in  -> a pill,   class `nav-primary`      (solid blue)
//   mobile     -> `mobile-auth-link`, with `.dashboard` for the signed-in state
//
// The original's signed-in pill said "Dashboard" and pointed at leadnear-main's
// /dashboard. This project has no dashboard, so the same slot carries the sign-out
// action instead — same placement, same styling, one control either way.
//
// The session now comes from useSession() rather than a hand-rolled fetch of
// /api/auth/session, because this app owns its NextAuth routes.

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();

  // Same placeholder the original used, so the navbar does not shift when the
  // session resolves. Its dimensions are set by globals.css.
  if (status === "loading") {
    return <div className="auth-nav-placeholder" aria-hidden="true" />;
  }

  if (session?.user) {
    return (
      <button
        type="button"
        className={mobile ? "mobile-auth-link dashboard" : "nav-primary"}
        title={session.user.email ?? undefined}
        onClick={() => signOut({ callbackUrl: "/" })}
      >
        Sign out
      </button>
    );
  }

  return (
    <Link href="/signin" className={mobile ? "mobile-auth-link" : "nav-login"}>
      Login
    </Link>
  );
}
