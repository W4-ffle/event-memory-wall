import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";
import { json, badRequest, serverError } from "../src/shared/http";

export default async function (req: HttpRequest, context: InvocationContext) {
  try {
    const hostId = req.headers.get("x-host-id") || "demo-host";
    const container = await getEventsContainer();

    if (req.method === "GET") {
      const querySpec = {
        query:
          "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@hostId", value: hostId }],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      json(context, 200, resources ?? []);
      return;
    }

    if (req.method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch {
        badRequest(context, "Invalid or missing JSON body");
        return;
      }

      if (
        !body?.title ||
        typeof body.title !== "string" ||
        !body.title.trim()
      ) {
        badRequest(context, "title is required");
        return;
      }

      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;

      const doc = {
        id: eventId, // Cosmos id
        eventId, // readable id for your app
        hostId, // partition-like grouping for host
        title: body.title.trim(),
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        createdAt: now,
      };

      await container.items.create(doc);

      json(context, 201, doc);
      return;
    }

    json(context, 405, { error: "Method not allowed" });
  } catch (err: any) {
    context.log("Events error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
