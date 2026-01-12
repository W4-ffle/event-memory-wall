import type { InvocationContext } from "@azure/functions";

export function json(
  context: InvocationContext,
  status: number,
  body: unknown
) {
  (context as any).res = {
    status,
    headers: { "Content-Type": "application/json" },
    body,
  };
}

export function badRequest(context: InvocationContext, message: string) {
  json(context, 400, { error: "Bad Request", message });
}

export function serverError(context: InvocationContext, err: any) {
  json(context, 500, {
    error: "Internal Server Error",
    message: err?.message ?? "Unknown error",
  });
}
