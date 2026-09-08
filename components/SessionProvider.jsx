"use client";

// Client-side session context for next-auth/react hooks (useSession, signIn,
// signOut). The root layout is a server component and cannot render the
// provider directly, so it lives here.
//
// The basePath is required, not cosmetic: next-auth/react defaults to calling
// /api/auth/* , but this app is mounted at /jobs, so its handlers are actually
// at /jobs/api/auth/* . Without this, every session lookup 404s and the UI
// looks permanently logged out.

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

const basePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`;

export default function SessionProvider({ children, session }) {
  return (
    <NextAuthSessionProvider session={session} basePath={basePath}>
      {children}
    </NextAuthSessionProvider>
  );
}
