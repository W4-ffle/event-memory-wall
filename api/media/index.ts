import { HttpRequest } from "@azure/functions";
import { randomUUID } from "crypto";
import { getMediaContainer } from "../src/shared/cosmos";
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

export default async function (context: any, req: HttpRequest): Promise<void> {
  context.log("media handler reached");

  try {
    if (handleOptions(context, req)) return;

    const eventId = context?.bindingData?.eventId;
    if (!eventId) {
      context.res = {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "eventId is required" },
      };
      return;
    }

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      context.res = {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Login required" },
      };
      return;
    }

    // membership enforcement (for BOTH GET and POST)
    const ev = await loadEventByHostAndId(hostId, String(eventId));
    if (!ev || ev.status === "DELETED") {
      context.res = {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Not found" },
      };
      return;
    }

    if (!isAdmin && !isMember(ev, userId)) {
      context.res = {
        status: 403,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Forbidden" },
      };
      return;
    }

    const container = await getMediaContainer();

    // GET: list media for an event (FILTER OUT SOFT-DELETED)
    if (req.method === "GET") {
      const querySpec = {
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

      const { resources } = await container.items.query(querySpec).fetchAll();

      context.res = {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: resources ?? [],
      };
      return;
    }

    // POST: save metadata after successful blob upload
    if (req.method === "POST") {
      let body: any;
      try {
        body = (req as any).body;
        if (typeof body === "string") body = JSON.parse(body);
      } catch {
        context.res = {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
          body: { error: "Invalid JSON body" },
        };
        return;
      }

      if (!body?.blobUrl || !body?.fileName) {
        context.res = {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
          body: { error: "blobUrl and fileName are required" },
        };
        return;
      }

      const now = new Date().toISOString();
      const mediaId = body.mediaId || `media_${randomUUID()}`;

      const doc = {
        id: mediaId,
        mediaId,
        hostId,
        eventId,
        uploaderId: String(userId), // ✅ enforce uploaderId from auth
        blobUrl: body.blobUrl,
        type: body.type || "IMAGE",
        fileName: body.fileName,
        contentType: body.contentType || "application/octet-stream",
        size: body.size || 0,
        status: "ACTIVE",
        createdAt: now,
      };

      await container.items.create(doc);

      context.res = {
        status: 201,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: doc,
      };
      return;
    }

    context.res = {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: { error: "Method not allowed" },
    };
  } catch (err: any) {
    context.log("MEDIA FAILED:", err?.message);
    context.log(err?.stack);

    context.res = {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
