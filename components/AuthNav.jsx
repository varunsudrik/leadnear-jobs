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
import { DEMO_FIT, DEMO_QUOTA, DEMO_SCANS_USED } from "@/lib/demo-fit";
import ScanPips from "@/components/ScanPips";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();

  // The design shows the pips for every visitor (spec line 57) while the demo
  // layer is on, with the mock's own default of 2 used. With
  // NEXT_PUBLIC_DEMO_FIT=false the page degrades to today's honest behaviour:
  // pips return to signed-in-only, and the count returns to the real (zero)
  // scans used rather than the mock's 2 — "3/3 free scans" is true, "1/3"
  // would not be. `status` (not `session?.user`) decides "signed in" here so
  // that loading, which cannot yet say either way, does not show pips when
  // the demo layer is off — the placeholder below already covers that
  // layout shift. Desktop only — the mock's phone header has no pips
  // (spec line 417).
  const showPips = !mobile && (DEMO_FIT || status === "authenticated");
  const scansUsed = DEMO_FIT ? DEMO_SCANS_USED : 0;
  const pips = showPips ? (
    <Link href="/resume" className="scan-pips-link" aria-label={`${DEMO_QUOTA - scansUsed} of ${DEMO_QUOTA} free scans — open resume scan`}>
      <ScanPips used={scansUsed} quota={DEMO_QUOTA} />
    </Link>
  ) : null;

  // Placeholder keeps the navbar from shifting while the session resolves;
  // its dimensions are set in globals.css. While the demo layer is on, the
  // pips don't depend on the session and render straight away; with it off
  // they wait for `status` to resolve, so nothing renders here (see `pips`
  // above).
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
