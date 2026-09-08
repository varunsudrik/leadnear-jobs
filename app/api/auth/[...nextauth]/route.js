// NextAuth v4 mounted as an App Router route handler. Both GET and POST must be
// exported — NextAuth uses GET for session/csrf/providers and POST for sign-in
// and sign-out.
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
