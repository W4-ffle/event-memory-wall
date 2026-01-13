import type { HttpRequest } from "@azure/functions";
import { handleOptions } from "../src/shared/http";

function getHeader(req: HttpRequest, name: string): string | undefined {
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

export function getAuth(req: HttpRequest) {
  const userId = (getHeader(req, "x-user-id") || "").trim();
  const adminPasscode = (getHeader(req, "x-admin-passcode") || "").trim();

  // "x-admin" is only advisory. Real admin is passcode match.
  const isAdmin =
    !!adminPasscode &&
    !!process.env.ADMIN_PASSCODE &&
    adminPasscode === process.env.ADMIN_PASSCODE;

  return { userId, isAdmin };
}

export function requireLogin(userId: string) {
  return !!userId;
}

export function requireAdmin(isAdmin: boolean) {
  return !!isAdmin;
}
