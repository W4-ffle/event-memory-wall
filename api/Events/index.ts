import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";

// Uncomment later once Events responds successfully
// import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - context-first");

  try {
    const headers = req.headers as unknown as Record<string, string>;

    const hostId = headers["x-host-id"] || headers["X-Host-Id"] || "demo-host";

    if (req.method === "GET") {
      (context as any).res = {
        status: 200,
        jsonBody: {
          ok: true,
          hostId,
          message: "GET /events working (no cosmos)",
        },
      };
      return;
    }

    if (req.method === "POST") {
      let body: any;

      try {
        // Try normal JSON parse first
        body = await req.json();
      } catch (e: any) {
        // Fallback: read text so we can diagnose what's being sent
        const raw = await req.text().catch(() => "");
        context.log(
          "POST /events JSON parse failed. content-type=" +
            (req.headers as any)["content-type"]
        );
        context.log("Raw body: " + raw);

        (context as any).res = {
          status: 400,
          jsonBody: {
            error: "Invalid or missing JSON body",
            hint: "Ensure Content-Type: application/json and Body is raw JSON",
            rawBody: raw,
          },
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

      // const container = await getEventsContainer();
      // await container.items.create(doc);

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
