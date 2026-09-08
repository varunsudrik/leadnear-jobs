// Server component wrapper. The form itself is a client component that reads
// useSearchParams(), which Next.js requires to sit inside a Suspense boundary —
// without one the production build fails rather than degrading at runtime.

import { Suspense } from "react";
import SignInForm from "@/components/SignInForm";

export const metadata = {
  title: "Sign in | LeadNear Jobs",
  // A sign-in form has nothing to offer a search index.
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="auth-page"><h1>Sign in</h1></div>}>
      <SignInForm />
    </Suspense>
  );
}
