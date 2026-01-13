import { HttpRequest } from "@azure/functions";
import { getEventsContainer, getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

function readJsonBody(req: any): any | null {
  const raw = req?.body;
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

function send(context: any, status: number, body: any) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json" },
    body,
  };
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    const eventId = (context?.bindingData?.eventId as string) || "";
    if (!eventId) {
      send(context, 400, { error: "eventId is required" });
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";

    const events = await getEventsContainer();

    // -------------------------
    // GET /v1/events/{eventId}
    // -------------------------
    if (req.method === "GET") {
      const q = {
        query: `
          SELECT TOP 1 * FROM c
          WHERE c.hostId = @hostId
            AND c.eventId = @eventId
            AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
        `,
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources } = await events.items.query(q).fetchAll();
      const ev = resources?.[0];

      if (!ev) {
        send(context, 404, { error: "Not found" });
        return;
      }

      send(context, 200, ev);
      return;
    }

    // -------------------------
    // PATCH /v1/events/{eventId}
    // -------------------------
    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      if (!body) {
        send(context, 400, { error: "Invalid or missing JSON body" });
        return;
      }

      const q = {
        query: `
          SELECT TOP 1 * FROM c
          WHERE c.hostId = @hostId
            AND c.eventId = @eventId
        `,
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources } = await events.items.query(q).fetchAll();
      const current = resources?.[0];

      if (!current || current.status === "DELETED") {
        send(context, 404, { error: "Not found" });
        return;
      }

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
      send(context, 200, updated);
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
      if (!ev || ev.status === "DELETED") {
        send(context, 404, { error: "Not found" });
        return;
      }

      const now = new Date().toISOString();

      // Soft-delete event
      await events.items.upsert({
        ...ev,
        status: "DELETED",
        deletedAt: now,
      });

      // Soft-delete media docs for this event (and try to delete blobs)
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

      send(context, 200, {
        ok: true,
        eventId,
        deletedMediaCount,
        blobDeleteFailures,
      });
      return;
    }

    send(context, 405, { error: "Method not allowed" });
  } catch (err: any) {
    context.log("EventById error:", err?.message);
    context.log(err?.stack);

    send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
