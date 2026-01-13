// api/src/shared/auth.ts
import type { HttpRequest } from "@azure/functions";

export function getHeader(req: any, name: string): string | undefined {
  const headers = (req?.headers ?? {}) as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

export function getAuth(req: HttpRequest) {
  const userId = String(getHeader(req as any, "x-user-id") || "").trim();
  const adminPasscode = String(
    getHeader(req as any, "x-admin-passcode") || ""
  ).trim();

  // IMPORTANT: match Azure App Setting name: ADMIN_PASSCODE
  const expected = String(process.env.ADMIN_PASSCODE || "").trim();

  // Real admin = passcode matches exactly (and env var exists)
  const isAdmin =
    !!userId && !!adminPasscode && !!expected && adminPasscode === expected;

  return { userId, isAdmin };
}

export function requireLogin(userId: string) {
  return !!userId;
}

export function requireAdmin(isAdmin: boolean) {
  return !!isAdmin;
}
