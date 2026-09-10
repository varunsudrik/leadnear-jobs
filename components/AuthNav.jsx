"use client";

// Session-aware navbar controls, matching the original in
// jobs-portal/components/AuthNav.jsx:
//
//   loading    -> `auth-nav-placeholder` (keeps the navbar from shifting
//                 while the session resolves; sized in globals.css)
//   signed out -> "Log in", class `nav-login`         (plain text link)
//   signed in, desktop -> scan-pips + avatar. The avatar has no menu, so it
//                 doubles as the sign-out control itself (clicking it signs
//                 out) rather than opening an account/settings surface that
//                 does not exist yet.
//   signed in, mobile  -> `mobile-auth-link` pill (`.dashboard` variant)
//                 that carries the same sign-out action.
//
// The session comes from useSession() rather than a hand-rolled fetch of
// /api/auth/session, because this app owns its NextAuth routes.

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { initials } from "@/lib/format";
import { DEMO_FIT, DEMO_SCANS_USED } from "@/lib/demo-fit";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();

  // The design shows the pips for every visitor (spec line 57), not only for
  // signed-in users, and the count is the mock's own default of 2 used. Both
  // the control and its number come from the demo layer: with
  // NEXT_PUBLIC_DEMO_FIT=false this renders nothing and the header returns to
  // showing auth state alone. Desktop only — the mock's phone header has no
  // pips (spec line 417).
  const pips = DEMO_FIT && !mobile ? (
    <span className="scan-pips">
      <span className="pips" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < DEMO_SCANS_USED ? "pip used" : "pip"} />
        ))}
      </span>
      <span className="mono">{3 - DEMO_SCANS_USED}</span>/3 free scans
    </span>
  ) : null;

  // Placeholder keeps the navbar from shifting while the session resolves;
  // its dimensions are set in globals.css. The pips do not depend on the
  // session, so they render straight away.
  if (status === "loading") {
    return <>{pips}<div className="auth-nav-placeholder" aria-hidden="true" /></>;
  }

  if (session?.user) {
    if (mobile) {
      return (
        <button
          type="button"
          className="mobile-auth-link dashboard"
          title={session.user.email ?? undefined}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      );
    }

    // The avatar has no menu, so it doubles as the sign-out control itself
    // rather than opening an account surface that does not exist yet.
    return (
      <>
        {pips}
        <button
          type="button"
          className="avatar"
          title={session.user.email ?? undefined}
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          {initials(session.user.name || session.user.email)}
        </button>
      </>
    );
  }

  return (
    <>
      {pips}
      <Link href="/signin" className={mobile ? "mobile-auth-link" : "nav-login"}>
        Log in
      </Link>
    </>
  );
}
