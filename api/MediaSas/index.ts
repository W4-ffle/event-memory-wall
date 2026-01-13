import { HttpRequest } from "@azure/functions";
import { makeUploadSas } from "../src/shared/blob";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    // route param: v1/events/{eventId}/media/sas
    const eventId = context?.bindingData?.eventId as string;
    if (!eventId) {
      context.res = { status: 400, body: { error: "eventId is required" } };
      return;
    }

    // body comes from req.body in your classic model
    let body: any;
    try {
      body = (req as any).body;
      if (typeof body === "string") body = JSON.parse(body);
    } catch {
      context.res = { status: 400, body: { error: "Invalid JSON body" } };
      return;
    }

    if (!body?.fileName || !body?.contentType) {
      context.res = {
        status: 400,
        body: { error: "fileName and contentType are required" },
      };
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";

    // Build a blob path that groups by host + event
    const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobName = `${hostId}/${eventId}/${Date.now()}_${safeName}`;

    // Returns uploadUrl + blobUrl + expiresOn
    const sas = makeUploadSas(blobName);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        // explicit keys the frontend can rely on
        uploadUrl: sas.uploadUrl,
        blobUrl: sas.blobUrl,
        blobName: sas.blobName,
        expiresOn: sas.expiresOn,

        // useful metadata
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
      headers: { "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
