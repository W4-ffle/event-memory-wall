import { HttpRequest } from "@azure/functions";
import { getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";

// ---- CORS ----
const ALLOWED_ORIGIN = "https://stgemwjb.z33.web.core.windows.net";
const ALLOWED_HEADERS = "Content-Type, x-host-id, x-user-id, x-admin-passcode";
const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
  };
}

function handleOptions(context: any, req: HttpRequest): boolean {
  if (req.method !== "OPTIONS") return false;
  context.res = { status: 204, headers: { ...corsHeaders() }, body: "" };
  return true;
}

function send(context: any, status: number, body: any) {
  context.res = {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body,
  };
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    if (handleOptions(context, req)) return;

    // This function should ONLY be called with DELETE.
    if (req.method !== "DELETE") {
      send(context, 405, { error: "Method not allowed" });
      return;
    }

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";

    const eventId = context?.bindingData?.eventId as string;
    const mediaId = context?.bindingData?.mediaId as string;

    if (!eventId || !mediaId) {
      send(context, 400, { error: "eventId and mediaId are required" });
      return;
    }

    const { userId, isAdmin } = getAuth(req);

    if (!requireLogin(userId)) {
      send(context, 401, { error: "Login required" });
      return;
    }

    // membership enforcement (admin OR event member)
    const ev = await loadEventByHostAndId(hostId, eventId);
    if (!ev || ev.status === "DELETED") {
      send(context, 404, { error: "Not found" });
      return;
    }

    if (!isAdmin && !isMember(ev, userId)) {
      send(context, 403, { error: "Forbidden" });
      return;
    }

    const container = await getMediaContainer();

    // Find the media doc
    const querySpec = {
      query: `
        SELECT TOP 1 * FROM c
        WHERE c.hostId = @hostId
          AND c.eventId = @eventId
          AND c.mediaId = @mediaId
          AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
      `,
      parameters: [
        { name: "@hostId", value: hostId },
        { name: "@eventId", value: eventId },
        { name: "@mediaId", value: mediaId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    const doc = resources?.[0];

    if (!doc) {
      send(context, 404, { error: "Not found" });
      return;
    }

    // Soft delete in Cosmos
    const now = new Date().toISOString();
    const updated = {
      ...doc,
      status: "DELETED",
      deletedAt: now,
      deletedBy: userId,
    };

    await container.items.upsert(updated);

    // Best-effort blob delete (optional)
    try {
      if (doc.blobUrl) {
        await deleteBlobIfPossible(doc.blobUrl);
      }
    } catch (e: any) {
      context.log("Blob delete failed (ignored):", e?.message);
    }

    send(context, 200, { ok: true, eventId, mediaId });
  } catch (err: any) {
    context.log("MediaDelete error:", err?.message);
    context.log(err?.stack);
    send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
