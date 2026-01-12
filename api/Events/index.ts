import {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const container = await getEventsContainer();
  const hostId = request.headers.get("x-host-id") || "demo-host";

  if (request.method === "GET") {
    try {
      const querySpec = {
        query:
          "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@hostId", value: hostId }],
      };

      const { resources } = await container.items
        .query(querySpec, { partitionKey: hostId })
        .fetchAll();

      return { status: 200, jsonBody: resources };
    } catch (err: any) {
      context.log("GET /events failed", err);
      return {
        status: 500,
        jsonBody: { error: "Cosmos query failed", message: err?.message },
      };
    }
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

    try {
      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;

      const doc = {
        id: eventId,
        eventId,
        hostId,
        title: body.title,
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        createdAt: now,
      };

      await container.items.create(doc);

      return { status: 201, jsonBody: doc };
    } catch (err: any) {
      context.log("POST /events failed", err);
      return {
        status: 500,
        jsonBody: { error: "Cosmos create failed", message: err?.message },
      };
    }
  }

  return { status: 405, jsonBody: { error: "Method not allowed" } };
}
