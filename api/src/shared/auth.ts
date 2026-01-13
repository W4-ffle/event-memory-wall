// api/src/shared/auth.ts
import type { HttpRequest } from "@azure/functions";

/**
 * Robust header getter: works whether headers is a plain object
 * OR a Fetch Headers-like instance with .get().
 */
export function getHeader(req: any, name: string): string {
  const headers: any = req?.headers;

  if (!headers) return "";

  // Case 1: Headers-like
  if (typeof headers.get === "function") {
    return String(headers.get(name) || "").trim();
  }

  // Case 2: plain object
  const h = headers as Record<string, any>;
  return String(
    h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || ""
  ).trim();
}

export function getAuth(req: HttpRequest) {
  const userId = getHeader(req, "x-user-id");
  const adminPasscode = getHeader(req, "x-admin-passcode");

  const envPass = String(process.env.ADMIN_PASSCODE || "").trim();

  const isAdmin = !!adminPasscode && !!envPass && adminPasscode === envPass;

  return { userId, isAdmin };
}

export function requireLogin(userId: string) {
  return !!userId;
}

export function requireAdmin(isAdmin: boolean) {
  return !!isAdmin;
}
