import type { HttpRequest } from "@azure/functions";

// NOTE: CORS handling is done per-function (recommended).
// This file only provides auth helpers.

function getHeader(req: HttpRequest, name: string): string | undefined {
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

export function getAuth(req: HttpRequest) {
  const userId = (getHeader(req, "x-user-id") || "").trim();
  const adminPasscode = (getHeader(req, "x-admin-passcode") || "").trim();

  const expected = (process.env.ADMIN_PASSCODE || "").trim();

  // Admin = correct passcode matches env var
  const isAdmin = !!adminPasscode && !!expected && adminPasscode === expected;

  return { userId, isAdmin };
}

export function requireLogin(userId: string) {
  return !!userId;
}

export function requireAdmin(isAdmin: boolean) {
  return !!isAdmin;
}
