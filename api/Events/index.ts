import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const container = await getEventsContainer();
  const hostId = request.headers.get("x-host-id") || "demo-host";

  if (request.method === "GET") {
    const query = {
      query: "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
      parameters: [{ name: "@hostId", value: hostId }]
    };
    const { resources } = await container.items.query(query).fetchAll();
    return { status: 200, jsonBody: resources };
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    if (!body.title) {
      return { status: 400, jsonBody: { error: "title is required" } };
    }

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
      createdAt: now
    };

    await container.items.create(doc);
    return { status: 201, jsonBody: doc };
  }

  return { status: 405, jsonBody: { error: "Method not allowed" } };
}
