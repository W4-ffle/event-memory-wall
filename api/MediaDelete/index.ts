import { HttpRequest } from "@azure/functions";
import { getMediaContainer } from "../src/shared/cosmos";
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
    const mediaId = (context?.bindingData?.mediaId as string) || "";

    if (!eventId || !mediaId) {
      json(context, 400, { error: "eventId and mediaId are required" });
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";

    const container = await getMediaContainer();

    // In your schema, id === mediaId and partition key is hostId (based on your docs)
    const item = container.item(mediaId, hostId);

    // Read existing (so we can attempt blob delete)
    const { resource } = await item.read<any>();
    if (!resource) {
      json(context, 404, { error: "Not found" });
      return;
    }

    // Mark as deleted (recommended over hard delete for CW2)
    const updated = {
      ...resource,
      status: "DELETED",
      deletedAt: new Date().toISOString(),
    };

    await item.replace(updated);

    // Best-effort blob delete (do NOT fail the API if this fails)
    try {
      if (resource.blobUrl) {
        await deleteBlobIfPossible(resource.blobUrl);
      }
    } catch (e: any) {
      context.log("Blob delete failed (ignored):", e?.message);
    }

    json(context, 200, { ok: true, mediaId, eventId });
  } catch (err: any) {
    context.log("MediaDelete error:", err?.message);
    context.log(err?.stack);

    json(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
