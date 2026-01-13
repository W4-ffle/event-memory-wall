import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";
import {
  json,
  badRequest,
  methodNotAllowed,
  serverError,
} from "../src/shared/http";

function getHeader(req: HttpRequest, name: string): string | undefined {
  // Runtime headers behave like a plain object in your deployment.
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

function readJsonBody(req: HttpRequest): any {
  // Classic model: req.body is usually object or string
  const raw = (req as any).body;
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - stable");

  try {
    const hostId = getHeader(req, "x-host-id") || "demo-host";
    const container = await getEventsContainer();

    // bindingData exists at runtime, but types may not include it
    const eventId = (context as any)?.bindingData?.eventId as
      | string
      | undefined;

    // ---------------- GET: list events (excluding deleted) ----------------
    if (req.method === "GET") {
      const querySpec = {
        query: `
          SELECT * FROM c
          WHERE c.hostId = @hostId
            AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
          ORDER BY c.createdAt DESC
        `,
        parameters: [{ name: "@hostId", value: hostId }],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();
      json(context, 200, resources ?? []);
      return;
    }

    // ---------------- POST: create event ----------------
    if (req.method === "POST") {
      const body = readJsonBody(req);
      if (!body) {
        badRequest(context, "Invalid or missing JSON body");
        return;
      }

      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        badRequest(context, "title is required");
        return;
      }

      const now = new Date().toISOString();
      const newEventId = `event_${randomUUID()}`;

      const doc = {
        id: newEventId,
        eventId: newEventId,
        hostId,
        title: body.title.trim(),
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        createdAt: now,
        // keep status undefined by default so your GET filter includes it
      };

      await container.items.create(doc);
      json(context, 201, doc);
      return;
    }

    // ---------------- PUT: update event ----------------
    // Route: /v1/events/{eventId}
    if (req.method === "PUT") {
      if (!eventId) {
        badRequest(context, "eventId is required");
        return;
      }

      const body = readJsonBody(req);
      if (!body) {
        badRequest(context, "Invalid or missing JSON body");
        return;
      }

      // Read existing doc (partition key assumed to be hostId, matching your design)
      const { resource } = await container.item(eventId, hostId).read<any>();

      if (!resource) {
        json(context, 404, { error: "Not found" });
        return;
      }

      // If already deleted, treat as not found (cleaner UX)
      if (resource.status === "DELETED") {
        json(context, 404, { error: "Not found" });
        return;
      }

      // Apply partial updates (only overwrite provided fields)
      const updated = {
        ...resource,
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : resource.title,
        description:
          typeof body.description === "string"
            ? body.description
            : resource.description,
        startsAt:
          body.startsAt === null || typeof body.startsAt === "string"
            ? body.startsAt
            : resource.startsAt,
        endsAt:
          body.endsAt === null || typeof body.endsAt === "string"
            ? body.endsAt
            : resource.endsAt,
        visibility:
          typeof body.visibility === "string"
            ? body.visibility
            : resource.visibility,
        updatedAt: new Date().toISOString(),
      };

      await container.item(eventId, hostId).replace(updated);
      json(context, 200, updated);
      return;
    }

    // ---------------- DELETE: soft delete event ----------------
    // Route: /v1/events/{eventId}
    if (req.method === "DELETE") {
      if (!eventId) {
        badRequest(context, "eventId is required");
        return;
      }

      const { resource } = await container.item(eventId, hostId).read<any>();

      if (!resource) {
        json(context, 404, { error: "Not found" });
        return;
      }

      if (resource.status === "DELETED") {
        // idempotent delete
        json(context, 204, null);
        return;
      }

      const deletedDoc = {
        ...resource,
        status: "DELETED",
        deletedAt: new Date().toISOString(),
      };

      await container.item(eventId, hostId).replace(deletedDoc);

      json(context, 204, null);
      return;
    }

    methodNotAllowed(context);
  } catch (err: any) {
    context.log("Events error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
