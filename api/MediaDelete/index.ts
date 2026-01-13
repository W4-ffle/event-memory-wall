import { HttpRequest } from "@azure/functions";
import { makeReadSasFromBlobUrl } from "../src/shared/blob";
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
  try {
    if (handleOptions(context, req)) return;

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";

    const eventId = context?.bindingData?.eventId as string;
    const mediaId = context?.bindingData?.mediaId as string;

    if (!eventId || !mediaId) {
      context.res = {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "eventId and mediaId are required" },
      };
      return;
    }

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      context.res = {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Login required" },
      };
      return;
    }

    // membership enforcement
    const ev = await loadEventByHostAndId(hostId, eventId);
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

    if (!doc?.blobUrl) {
      context.res = {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Media not found" },
      };
      return;
    }

    const sas = makeReadSasFromBlobUrl(doc.blobUrl);

    context.res = {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: {
        readUrl: sas.readUrl,
        expiresOn: sas.expiresOn,
        blobUrl: doc.blobUrl,
        mediaId: doc.mediaId,
        eventId: doc.eventId,
      },
    };
  } catch (err: any) {
    context.log("MediaReadSas error:", err?.message);
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
