import type { InvocationContext, HttpRequest } from "@azure/functions";

const ALLOWED_ORIGIN = "https://stgemwjb.z33.web.core.windows.net";

// Add every custom header your frontend uses here
const ALLOWED_HEADERS = "Content-Type, x-host-id, x-user-id, x-admin-passcode";

const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    // Optional (only needed if you start using cookies)
    // "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * If request is OPTIONS preflight, respond and return true (caller should exit).
 */
export function handleOptions(context: InvocationContext, req: HttpRequest) {
  if (req.method !== "OPTIONS") return false;

  (context as any).res = {
    status: 204,
    headers: {
      ...corsHeaders(),
    },
    body: "",
  };
  return true;
}

export function json(
  context: InvocationContext,
  status: number,
  body: unknown
) {
  (context as any).res = {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
    body,
  };
}

export function badRequest(context: InvocationContext, message: string) {
  json(context, 400, { error: "Bad Request", message });
}

export function methodNotAllowed(context: InvocationContext) {
  json(context, 405, { error: "Method not allowed" });
}

export function serverError(context: InvocationContext, err: any) {
  json(context, 500, {
    error: "Internal Server Error",
    message: err?.message ?? "Unknown error",
  });
}
