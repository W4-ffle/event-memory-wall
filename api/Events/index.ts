import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Deployment marker (helps you confirm latest code is running)
  context.log("Events handler reached - v3");

  try {
    const hostId = request.headers.get("x-host-id") || "demo-host";

    // IMPORTANT: wrap container init in try/catch (Cosmos env/config issues throw here)
    const container = await getEventsContainer();

    if (request.method === "GET") {
      const querySpec = {
        query: "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@hostId", value: hostId }],
      };

      // NOTE: no partitionKey option (avoids typing issues and still works for CW2)
      const { resources } = await container.items.query(querySpec).fetchAll();

      return { status: 200, jsonBody: resources };
    }

    if (request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return {
          status: 400,
          jsonBody: { error: "Invalid or missing JSON body" },
        };
      }

      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
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

      await container.items.create(doc);

      return { status: 201, jsonBody: doc };
    }

    return { status: 405, jsonBody: { error: "Method not allowed" } };
  } catch (err: any) {
    // Guaranteed error output
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
