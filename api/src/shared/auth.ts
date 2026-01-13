import type { HttpRequest } from "@azure/functions";

/**
 * Safely read a header in Azure Functions runtime
 */
function getHeader(req: HttpRequest, name: string): string | undefined {
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

/**
 * Extract authentication context from request headers
 *
 * x-user-id          → required for all users
 * x-admin-passcode   → required for admin privileges
 */
export function getAuth(req: HttpRequest) {
  const userId = (getHeader(req, "x-user-id") || "").trim();
  const adminPasscode = (getHeader(req, "x-admin-passcode") || "").trim();

  const isAdmin =
    !!adminPasscode &&
    !!process.env.ADMIN_PASSCODE &&
    adminPasscode === process.env.ADMIN_PASSCODE;

  return {
    userId,
    isAdmin,
  };
}

/**
 * Require that a user is logged in
 */
export function requireLogin(userId: string): boolean {
  return !!userId;
}

/**
 * Require that a user is an admin
 */
export function requireAdmin(isAdmin: boolean): boolean {
  return !!isAdmin;
}
