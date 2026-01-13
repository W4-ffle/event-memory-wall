import { HttpRequest } from "@azure/functions";
import { getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    const eventId = (context?.bindingData?.eventId as string) || "";
    const mediaId = (context?.bindingData?.mediaId as string) || "";

    if (!eventId || !mediaId) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "eventId and mediaId are required" },
      };
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";
    const container = await getMediaContainer();

    // Query instead of item(id, pk) to avoid partition-key mismatch issues
    const querySpec = {
      query:
        "SELECT TOP 1 * FROM c WHERE c.eventId = @eventId AND c.mediaId = @mediaId AND c.hostId = @hostId",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@mediaId", value: mediaId },
        { name: "@hostId", value: hostId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    const doc = resources?.[0];

    if (!doc) {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "Not found" },
      };
      return;
    }

    // Soft delete (recommended)
    const updated = {
      ...doc,
      status: "DELETED",
      deletedAt: new Date().toISOString(),
    };

    // Upsert avoids needing to know the partition key value explicitly,
    // as long as the doc contains the partition key field (yours does).
    await container.items.upsert(updated);

    // Best-effort blob delete (don’t fail if it errors)
    try {
      if (doc.blobUrl) {
        await deleteBlobIfPossible(doc.blobUrl);
      }
    } catch (e: any) {
      context.log("Blob delete failed (ignored):", e?.message);
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { ok: true, eventId, mediaId },
    };
  } catch (err: any) {
    context.log("MediaDelete error:", err?.message);
    context.log(err?.stack);

    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
