import { timingSafeEqual } from "node:crypto";

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function hasValidAdminAuth(request) {
  const expectedUser = process.env.ADMIN_USER || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  const authorization = request.headers.get("authorization") || "";

  if (!expectedUser || !expectedPassword || !authorization.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;

    return (
      safeEqual(decoded.slice(0, separator), expectedUser) &&
      safeEqual(decoded.slice(separator + 1), expectedPassword)
    );
  } catch {
    return false;
  }
}
