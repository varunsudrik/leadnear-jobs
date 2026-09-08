import { fileURLToPath } from "node:url";

// Kept at "/jobs" so this app stays drop-in compatible with the rewrite that
// mounts it under leadnear.com — PUBLIC_BASE_URL, app/sitemap.js, canonical
// tags and the JobPosting JSON-LD all assume that prefix. Change both this and
// PUBLIC_BASE_URL together if it ever needs to serve from the root.
const basePath = "/jobs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,

  // Files in public/ are served *under* basePath (public/images/x.svg becomes
  // /jobs/images/x.svg), but a plain <img src="/images/x.svg"> is not rewritten
  // the way next/link and next/image are. Exposing the prefix lets those few
  // raw references build a correct URL from the single definition above.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

  // Every route lives under basePath, so the bare origin matches nothing and
  // returns a stock 404 — which reads like a broken app rather than a wrong
  // URL. `basePath: false` lets this one redirect be declared outside the
  // prefix, sending http://host/ to http://host/jobs.
  //
  // Harmless in production: there the app is reached through a rewrite that
  // only ever forwards /jobs/*, so nothing hits this app's root.
  async redirects() {
    return [
      {
        source: "/",
        destination: basePath,
        permanent: false, // 307 — keeps the door open to serving / later
        basePath: false,
      },
    ];
  },

  // The container rootfs is read-only outside of a few bind-mounted paths;
  // see cache-handler.mjs for why this is required rather than optional there.
  // Next only consults this for production builds, not `next dev`.
  //
  // Omitted on Vercel, which supplies its own ISR cache and does not support a
  // custom cacheHandler. Ours also assumes a writable bind-mounted directory
  // that does not exist on a serverless filesystem, so leaving it in place
  // means every revalidation write fails.
  ...(process.env.VERCEL
    ? {}
    : { cacheHandler: fileURLToPath(new URL("./cache-handler.mjs", import.meta.url)) }),
};

export default nextConfig;
