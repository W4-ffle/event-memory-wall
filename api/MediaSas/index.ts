import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { json, badRequest, serverError } from "../src/shared/http";
import { makeUploadSas } from "../src/shared/blob";

export default async function (req: HttpRequest, context: InvocationContext) {
  try {
    const hostId = req.headers.get("x-host-id") || "demo-host";
    const eventId = (context as any)?.bindingData?.eventId;

    if (!eventId) {
      badRequest(context, "Missing eventId in route");
      return;
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      badRequest(context, "Invalid or missing JSON body");
      return;
    }

    const fileName = body?.fileName;
    const contentType = body?.contentType;

    if (!fileName || typeof fileName !== "string") {
      badRequest(context, "fileName is required");
      return;
    }

    // Create a unique blob name under the event folder
    const mediaId = `media_${randomUUID()}`;
    const safeName = fileName.replace(/[^\w.\-]+/g, "_");
    const blobName = `${hostId}/${eventId}/${mediaId}_${safeName}`;

    const sas = makeUploadSas(blobName);

    json(context, 200, {
      mediaId,
      eventId,
      hostId,
      uploadUrl: sas.url, // PUT the file to this
      blobUrl: sas.blobUrl, // store this in Cosmos metadata
      expiresOn: sas.expiresOn,
      contentType: contentType || "application/octet-stream",
    });
  } catch (err: any) {
    context.log("MediaSas error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
