import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - classic model");

  try {
    const headers = req.headers as unknown as Record<string, any>;
    const hostId = headers["x-host-id"] || headers["X-Host-Id"] || "demo-host";

    if (req.method === "GET") {
      (context as any).res = {
        status: 200,
        jsonBody: { ok: true, hostId, message: "GET /events working" },
      };
      return;
    }

    if (req.method === "POST") {
      // --- Body parsing for classic Functions model ---
      let body: any;

      try {
        body = (req as any).body;

        if (typeof body === "string") {
          body = JSON.parse(body);
        }

        if (!body) {
          throw new Error("Empty body");
        }
      } catch {
        context.log("POST /events body parse failed");
        context.log("content-type: " + (headers["content-type"] ?? ""));
        context.log("raw body: " + String((req as any).body ?? ""));

        (context as any).res = {
          status: 400,
          jsonBody: {
            error: "Invalid or missing JSON body",
            hint: "Send raw JSON with Content-Type: application/json",
          },
        };
        return;
      }

      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        (context as any).res = {
          status: 400,
          jsonBody: { error: "title is required" },
        };
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

    (context as any).res = {
      status: 405,
      jsonBody: { error: "Method not allowed" },
    };
  } catch (err: any) {
    context.log("Events FAILED: " + (err?.message ?? "Unknown error"));
    (context as any).res = {
      status: 500,
      jsonBody: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
