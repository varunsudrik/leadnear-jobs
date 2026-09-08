import { NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LeadNear Jobs Admin"' },
  });
}

export function middleware(request) {
  const expectedUser = process.env.ADMIN_USER || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  const authorization = request.headers.get("authorization") || "";

  if (!expectedUser || !expectedPassword || !authorization.startsWith("Basic ")) {
    return unauthorized();
  }

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    if (separator < 0 || user !== expectedUser || password !== expectedPassword) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/backoffice/:path*",
    "/api/backoffice/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
