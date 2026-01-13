import { HttpRequest } from "@azure/functions";
import { makeUploadSas } from "../src/shared/blob";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";

// ---- CORS (keep aligned with your EventById) ----
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

    // route param: v1/events/{eventId}/media/sas
    const eventId = context?.bindingData?.eventId as string;
    if (!eventId) {
      context.res = {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "eventId is required" },
      };
      return;
    }

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";

    // auth
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

    // classic model: body from req.body
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

    if (!body?.fileName || !body?.contentType) {
      context.res = {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "fileName and contentType are required" },
      };
      return;
    }

    // Build a blob path that groups by host + event
    const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobName = `${hostId}/${eventId}/${Date.now()}_${safeName}`;

    // makeUploadSas returns: { url, blobUrl, expiresOn }
    const sas = makeUploadSas(blobName);

    context.res = {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: {
        uploadUrl: sas.url,
        blobUrl: sas.blobUrl,
        blobName,
        expiresOn: sas.expiresOn,

        contentType: body.contentType,
        eventId,
        hostId,
      },
    };
  } catch (err: any) {
    context.log("MediaSas error:", err?.message);
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
