import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";

// IMPORTANT: keep Cosmos disabled for now while we confirm the function loads on Azure
// import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Events handler reached - v4 (no cosmos)");

  try {
    const hostId = request.headers.get("x-host-id") || "demo-host";

    // const container = await getEventsContainer();

    if (request.method === "GET") {
      // Temporary: return a predictable payload so we can confirm the function is running in Azure
      return {
        status: 200,
        jsonBody: {
          ok: true,
          mode: "no-cosmos",
          hostId,
          message: "GET /events is working",
        },
      };
    }

    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: "Invalid or missing JSON body" } };
      }

      if (!body?.title || typeof body.title !== "string" || !body.title.trim()) {
        return { status: 400, jsonBody: { error: "title is required" } };
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

      // await container.items.create(doc);

      return { status: 201, jsonBody: doc };
    }

    return { status: 405, jsonBody: { error: "Method not allowed" } };
  } catch (err: any) {
    context.log("Events FAILED:");
    context.log("Message: " + (err?.message ?? "Unknown error"));
    context.log("Stack: " + (err?.stack ?? "No stack"));

    return {
      status: 500,
      jsonBody: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
