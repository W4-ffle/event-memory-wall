import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";

// keep cosmos disabled for now
// import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<void> {
  context.log("Events handler reached - context.res mode");

  try {
    const hostId = request.headers.get("x-host-id") || "demo-host";

    if (request.method === "GET") {
      (context as any).res = {
        status: 200,
        jsonBody: { ok: true, mode: "no-cosmos", hostId, message: "GET /events working" },
      };
      return;
    }

    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        (context as any).res = { status: 400, jsonBody: { error: "Invalid or missing JSON body" } };
        return;
      }

      if (!body?.title || typeof body.title !== "string" || !body.title.trim()) {
        (context as any).res = { status: 400, jsonBody: { error: "title is required" } };
        return;
      }

      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;

      const doc = {
        id: eventId,
        eventId,
        hostId,
        title: body.title.trim(),
        createdAt: now,
      };

      (context as any).res = { status: 201, jsonBody: doc };
      return;
    }

    (context as any).res = { status: 405, jsonBody: { error: "Method not allowed" } };
  } catch (err: any) {
    context.log("Events FAILED: " + (err?.message ?? "Unknown error"));
    (context as any).res = {
      status: 500,
      jsonBody: { error: "Internal server error", message: err?.message ?? "Unknown error" },
    };
  }
}
