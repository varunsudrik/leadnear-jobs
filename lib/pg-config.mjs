// lib/pg-config.mjs — one place that turns environment variables into a pg
// connection config, shared by the app pool (lib/db.js) and the standalone
// scripts (scripts/publish-jobs.mjs, scripts/seed-from-prod.mjs).
//
// Two supported shapes, in priority order:
//   1. DATABASE_URL  — a single postgres:// URL (what Aiven hands you)
//   2. DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME — the discrete vars the
//      original VPS deployment and scripts/import_to_postgres.py use
//
// Written as .mjs so plain `node scripts/*.mjs` can import it. package.json has
// no "type": "module", so a .js file here would be read as CommonJS by node and
// the import would fail — Next.js is happy with either.

// pg >= 8.16 resolves sslmode=require to libpq's *verify-full* semantics, not
// libpq's own weaker "require". Aiven serves a certificate signed by its own
// project CA, so verify-full fails with "self-signed certificate in certificate
// chain" and the connection never opens. Stripping the parameter here lets the
// explicit `ssl` object below decide, which is the only way to express
// "encrypt, and verify against this CA (or don't)".
function stripSslMode(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    // Not parseable as a URL — hand it back untouched and let pg report it.
    return url;
  }
}

function wantsSsl(url) {
  if (process.env.DB_SSL === "disable" || process.env.DB_SSL === "false") return false;
  if (process.env.DB_SSL === "require" || process.env.DB_SSL === "true") return true;
  // Infer from the URL when not stated explicitly.
  return typeof url === "string" && /sslmode=(require|verify-ca|verify-full)/.test(url);
}

function sslOptions() {
  // Supplying the provider's CA is the correct way to keep full verification.
  // Aiven exposes it in the console as "CA certificate"; point DB_SSL_CA at the
  // downloaded file and the chain validates properly.
  const ca = process.env.DB_SSL_CA;
  if (ca) return { ca, rejectUnauthorized: true };

  // Without a CA on hand, encrypt but skip chain verification. This protects
  // the credentials in transit but not against an active MITM, so it is a
  // deliberate development-only fallback rather than the default for anything
  // holding real user data.
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
}

export function buildPgConfig(overrides = {}) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

  const connection = url
    ? { connectionString: stripSslMode(url) }
    : {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || "jobuser",
        password: process.env.DB_PASS || "jobpass123",
        database: process.env.DB_NAME || "jobboard",
      };

  return {
    ...connection,
    ...(wantsSsl(url) ? { ssl: sslOptions() } : {}),
    // Aiven's smaller plans cap max_connections at 20 for *everything* —
    // app, migrations, psql sessions. Keep the default modest and let
    // DB_POOL_MAX raise it on a host with real headroom.
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    // A managed host across the network needs longer than a unix socket.
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
    ...overrides,
  };
}

// Host shown in logs and errors, without leaking the password.
export function describeTarget() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (url) {
    try {
      const { hostname, port, pathname } = new URL(url);
      return `${hostname}:${port}${pathname}`;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  }
  return `${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 5432}/${
    process.env.DB_NAME || "jobboard"
  }`;
}
