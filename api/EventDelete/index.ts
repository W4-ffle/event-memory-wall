import { HttpRequest } from "@azure/functions";
import { getEventsContainer, getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

function json(context: any, status: number, body: any) {
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
      json(context, 400, { error: "eventId is required" });
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";

    const events = await getEventsContainer();
    const media = await getMediaContainer();

    // 1) Find event doc (query avoids partition key mismatch)
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

    // 2) Soft-delete event
    const now = new Date().toISOString();
    const deletedEvent = {
      ...ev,
      status: "DELETED",
      deletedAt: now,
    };

    await events.items.upsert(deletedEvent);

    // 3) Soft-delete media items for this event (and optionally delete blobs)
    const mediaQuery = {
      query:
        "SELECT * FROM c WHERE c.hostId = @hostId AND c.eventId = @eventId AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')",
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
      const updated = {
        ...m,
        status: "DELETED",
        deletedAt: now,
      };

      await media.items.upsert(updated);
      deletedMediaCount++;

      // Best-effort blob delete (ignore failures)
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
  } catch (err: any) {
    context.log("EventDelete error:", err?.message);
    context.log(err?.stack);

    json(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
