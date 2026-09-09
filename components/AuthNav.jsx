"use client";

// Session-aware navbar controls, matching the original in
// jobs-portal/components/AuthNav.jsx:
//
//   loading    -> `auth-nav-placeholder` (keeps the navbar from shifting
//                 while the session resolves; sized in globals.css)
//   signed out -> "Log in", class `nav-login`         (plain text link)
//   signed in, desktop -> scan-pips + avatar, matching the Direction C
//                 header mockup. The avatar has no menu yet, so there is
//                 intentionally no sign-out affordance here.
//   signed in, mobile  -> `mobile-auth-link` pill (`.dashboard` variant)
//                 that still carries the sign-out action, since the
//                 desktop avatar can't yet.
//
// The scan-pips ("N/3 free scans") describe a Resume feature that has not
// shipped yet: `scansUsed` is hardcoded to 0 and the control is a plain,
// non-navigating <span> rather than a link to the not-yet-existing /resume
// route.
//
// The session comes from useSession() rather than a hand-rolled fetch of
// /api/auth/session, because this app owns its NextAuth routes.

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { initials } from "@/lib/format";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();

  // Same placeholder the original used, so the navbar does not shift when the
  // session resolves. Its dimensions are set by globals.css.
  if (status === "loading") {
    return <div className="auth-nav-placeholder" aria-hidden="true" />;
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

    const scansUsed = 0; // Resume feature not built yet; hardcoded until it lands.

    return (
      <>
        <span className="scan-pips">
          <span className="pips" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className={i < scansUsed ? "pip used" : "pip"} />)}
          </span>
          <span className="mono">{3 - scansUsed}</span>/3 free scans
        </span>
        <span className="avatar" title={session.user.email ?? undefined}>
          {initials(session.user.name || session.user.email)}
        </span>
      </>
    );
  }

  return (
    <Link href="/signin" className={mobile ? "mobile-auth-link" : "nav-login"}>
      Log in
    </Link>
  );
}
