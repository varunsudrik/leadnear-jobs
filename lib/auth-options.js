// lib/auth-options.js — NextAuth configuration, kept separate from the route
// handler so server components and API routes can call getServerSession(authOptions)
// without importing the route module.
//
// Scope, compared with the original in leadnear-main:
//   * Credentials only. The Google and LinkedIn providers are omitted because
//     they need OAuth client secrets and registered redirect URIs.
//   * No admin-only gate. leadnear-main's middleware currently rejects every
//     non-admin session; this standalone app lets any valid user in.
//   * No referral/credit or admin-logging side effects on sign-in.
//
// basePath note: this app is mounted at /jobs, so NEXTAUTH_URL must include it
// (http://localhost:4100/jobs). NextAuth derives its own route prefix from that
// URL, putting the handlers at /jobs/api/auth/*.

import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "./prisma.mjs";

// NextAuth resolves `pages` and redirect targets against the bare origin — it
// has no knowledge of Next's basePath. Left unprefixed, a failed sign-in ends up
// at http://host/signin (404) instead of http://host/jobs/signin, and the
// default post-login callbackUrl points at the origin root, which is also
// outside this app. Every path handed to NextAuth therefore carries the prefix.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            image: true,
            isAdmin: true,
            isBlocked: true,
            role: true,
          },
        });

        // Every failure below returns the same null, so the caller cannot tell
        // "no such account" from "wrong password" and probe for valid emails.
        if (!user?.password) return null;
        if (user.isBlocked) return null;

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) return null;

        // Whatever is returned here becomes the `user` argument of the jwt
        // callback. The password hash must not be part of it.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          isAdmin: user.isAdmin,
          role: user.role,
        };
      },
    }),
  ],

  // The Credentials provider cannot use database sessions — NextAuth only
  // persists a Session row for adapter-backed providers — so JWT is required
  // rather than merely preferred here.
  session: {
    strategy: "jwt",
    maxAge: 3 * 30 * 24 * 60 * 60, // 3 months, matching leadnear-main
  },

  callbacks: {
    // `user` is only present on the first call, right after authorize().
    // Copy the fields the UI needs onto the token then, since later calls
    // receive the token alone.
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin ?? false;
        token.role = user.role ?? "user";
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id;
        session.user.isAdmin = token.isAdmin ?? false;
        session.user.role = token.role ?? "user";
      }
      return session;
    },

    // Keep every redirect inside the /jobs zone. `baseUrl` here is the bare
    // origin, so anything landing on it directly would 404.
    redirect: async ({ url, baseUrl }) => {
      const appRoot = `${baseUrl}${BASE_PATH}`;
      // Relative target from signIn/signOut callbackUrl.
      if (url.startsWith("/")) {
        return url.startsWith(`${BASE_PATH}/`) || url === BASE_PATH
          ? `${baseUrl}${url}`
          : `${appRoot}${url}`;
      }
      // Already inside the app. Checked before the origin test below, which
      // would otherwise swallow these.
      if (url.startsWith(appRoot)) return url;
      // Same origin but outside /jobs (NextAuth's default is the origin root):
      // send it to the app root instead of a 404.
      if (url.startsWith(baseUrl)) return appRoot;
      // Anything off-origin is not a destination this app should honour.
      return appRoot;
    },
  },

  pages: {
    signIn: `${BASE_PATH}/signin`,
    error: `${BASE_PATH}/signin`,
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
