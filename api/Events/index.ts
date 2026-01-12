import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - cosmos enabled");

  try {
    const headers = req.headers as unknown as Record<string, any>;
    const hostId = headers["x-host-id"] || headers["X-Host-Id"] || "demo-host";

    const container = await getEventsContainer();

    if (req.method === "GET") {
      const querySpec = {
        query:
          "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@hostId", value: hostId }],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      (context as any).res = { status: 200, jsonBody: resources };
      return;
    }

    if (req.method === "POST") {
      // --- Body parsing (classic model) ---
      let body: any;
      try {
        body = (req as any).body;
        if (typeof body === "string") body = JSON.parse(body);
        if (!body) throw new Error("Empty body");
      } catch {
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
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        createdAt: now,
      };

      await container.items.create(doc);

      (context as any).res = { status: 201, jsonBody: doc };
      return;
    }

    (context as any).res = {
      status: 405,
      jsonBody: { error: "Method not allowed" },
    };
  } catch (err: any) {
    context.log("Events FAILED: " + (err?.message ?? "Unknown error"));
    context.log("Stack: " + (err?.stack ?? "No stack"));

    (context as any).res = {
      status: 500,
      jsonBody: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
