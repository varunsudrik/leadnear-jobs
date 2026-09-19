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
//
// The pips themselves used to come from the old fit-layer module's static
// scan-count and quota fixtures. That layer is retired: this component
// is a client component (it needs useSession()), so it cannot call
// scanQuota() directly the way app/resume/page.jsx does — instead it fetches
// Task 7's GET /api/resume/quota once the session resolves to authenticated.

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { initials } from "@/lib/format";
import ScanPips from "@/components/ScanPips";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();
  // undefined = not yet asked or in flight, an object = the quota response,
  // null = signed out (nothing to ask) or the request failed. Distinguishing
  // "in flight" from "failed" matters below: a failed request must not hide
  // the avatar (and with it, the only way to sign out) forever.
  const [quota, setQuota] = useState(undefined);

  // `mobile` never renders pips (see the mobile branch below), so it must
  // also never fetch — SiteNavbar.jsx mounts a fresh <AuthNav mobile /> every
  // time the hamburger opens, and without this guard each open fired a real
  // GET /api/resume/quota (a prisma.resumeScan.count() query) whose answer
  // was then thrown away unread.
  useEffect(() => {
    if (mobile || status !== "authenticated") { setQuota(undefined); return; }
    let live = true;
    setQuota(undefined);
    fetch(`${BASE_PATH}/api/resume/quota`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setQuota(d))
      .catch(() => live && setQuota(null));
    return () => { live = false; };
  }, [status, mobile]);

  // Placeholder keeps the navbar from shifting while the session resolves;
  // its dimensions are set in globals.css.
  if (status === "loading") {
    return <div className="auth-nav-placeholder" aria-hidden="true" />;
  }

  if (session?.user) {
    if (mobile) {
      // Mobile never shows pips (spec line 417), so it doesn't wait on the
      // quota fetch below — only desktop needs that.
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

    // While the quota request is in flight, keep extending the same
    // placeholder that covers session resolution — the avatar appearing
    // first and the pips popping in a beat later would be its own layout
    // shift. A failed request (network error, a 503 from a storage outage)
    // resolves to `null` rather than hanging here forever: the avatar, and
    // the ability to sign out, still has to render even without pips.
    if (quota === undefined) {
      return <div className="auth-nav-placeholder" aria-hidden="true" />;
    }

    // The avatar has no menu, so it doubles as the sign-out control itself
    // rather than opening an account surface that does not exist yet.
    return (
      <>
        {quota ? (
          <Link
            href="/resume"
            className="scan-pips-link"
            aria-label={`${quota.remaining} of ${quota.quota} free scans — open resume scan`}
          >
            <ScanPips used={quota.used} quota={quota.quota} />
          </Link>
        ) : null}
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
    <Link href="/signin" className={mobile ? "mobile-auth-link" : "nav-login"}>
      Log in
    </Link>
  );
}
