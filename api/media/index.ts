import { HttpRequest, InvocationContext } from "@azure/functions";
import { json, badRequest, serverError } from "../src/shared/http";
import { getMediaContainer } from "../src/shared/cosmos";

export default async function (req: HttpRequest, context: InvocationContext) {
  try {
    const hostId = req.headers.get("x-host-id") || "demo-host";
    const eventId = (context as any)?.bindingData?.eventId;

    if (!eventId) {
      badRequest(context, "Missing eventId in route");
      return;
    }

    if (req.method !== "POST") {
      json(context, 405, { error: "Method not allowed" });
      return;
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      badRequest(context, "Invalid or missing JSON body");
      return;
    }

    const { mediaId, blobUrl, type, fileName, contentType, size } = body || {};

    if (!mediaId || !blobUrl) {
      badRequest(context, "mediaId and blobUrl are required");
      return;
    }

    const container = await getMediaContainer();
    const now = new Date().toISOString();

    const doc = {
      id: mediaId,
      mediaId,
      eventId,
      hostId,
      blobUrl,
      type: type || "IMAGE",
      fileName: fileName || null,
      contentType: contentType || null,
      size: typeof size === "number" ? size : null,
      createdAt: now,
      status: "ACTIVE",
    };

    await container.items.create(doc);

    json(context, 201, doc);
  } catch (err: any) {
    context.log("Media error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
