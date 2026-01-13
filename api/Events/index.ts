import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer, getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";
import {
  json,
  badRequest,
  methodNotAllowed,
  serverError,
} from "../src/shared/http";

function getHeader(req: HttpRequest, name: string): string | undefined {
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

function readJsonBody(req: HttpRequest): any {
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
    const eventId = (context as any)?.bindingData?.eventId as
      | string
      | undefined;

    const events = await getEventsContainer();

    // -------------------------
    // GET /v1/events
    // -------------------------
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

      const { resources } = await events.items.query(querySpec).fetchAll();
      json(context, 200, resources ?? []);
      return;
    }

    // -------------------------
    // POST /v1/events
    // -------------------------
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
        status: "ACTIVE",
        createdAt: now,
      };

      await events.items.create(doc);
      json(context, 201, doc);
      return;
    }

    // Everything below requires an eventId
    if (!eventId) {
      badRequest(context, "eventId is required");
      return;
    }

    // -------------------------
    // PATCH /v1/events/{eventId}
    // -------------------------
    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      if (!body) {
        badRequest(context, "Invalid or missing JSON body");
        return;
      }

      // Load existing
      const existingQuery = {
        query:
          "SELECT TOP 1 * FROM c WHERE c.hostId = @hostId AND c.eventId = @eventId",
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources: found } = await events.items
        .query(existingQuery)
        .fetchAll();

      const current = found?.[0];
      if (!current) {
        json(context, 404, { error: "Not found" });
        return;
      }

      if (current.status === "DELETED") {
        json(context, 404, { error: "Not found" });
        return;
      }

      // Only allow updating specific fields
      const updated = {
        ...current,
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : current.title,
        description:
          typeof body.description === "string"
            ? body.description
            : current.description,
        startsAt: body.startsAt ?? current.startsAt,
        endsAt: body.endsAt ?? current.endsAt,
        visibility:
          typeof body.visibility === "string"
            ? body.visibility
            : current.visibility,
        updatedAt: new Date().toISOString(),
      };

      await events.items.upsert(updated);
      json(context, 200, updated);
      return;
    }

    // -------------------------
    // DELETE /v1/events/{eventId}
    // Soft delete event + media + best-effort blob delete
    // -------------------------
    if (req.method === "DELETE") {
      const media = await getMediaContainer();

      // Find event
      const eventQuery = {
        query:
          "SELECT TOP 1 * FROM c WHERE c.hostId = @hostId AND c.eventId = @eventId",
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources: eventDocs } = await events.items
        .query(eventQuery)
        .fetchAll();

      const ev = eventDocs?.[0];
      if (!ev) {
        json(context, 404, { error: "Not found" });
        return;
      }

      const now = new Date().toISOString();

      // Soft-delete event
      await events.items.upsert({
        ...ev,
        status: "DELETED",
        deletedAt: now,
      });

      // Soft-delete media docs (and try to delete blobs)
      const mediaQuery = {
        query: `
          SELECT * FROM c
          WHERE c.hostId = @hostId
            AND c.eventId = @eventId
            AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
          ORDER BY c.createdAt DESC
        `,
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources: mediaDocs } = await media.items
        .query(mediaQuery)
        .fetchAll();

      let deletedMediaCount = 0;
      let blobDeleteFailures = 0;

      for (const m of mediaDocs ?? []) {
        await media.items.upsert({
          ...m,
          status: "DELETED",
          deletedAt: now,
        });
        deletedMediaCount++;

        try {
          if (m.blobUrl) await deleteBlobIfPossible(m.blobUrl);
        } catch {
          blobDeleteFailures++;
        }
      }

      json(context, 200, {
        ok: true,
        eventId,
        deletedMediaCount,
        blobDeleteFailures,
      });
      return;
    }

    methodNotAllowed(context);
  } catch (err: any) {
    context.log("Events error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
