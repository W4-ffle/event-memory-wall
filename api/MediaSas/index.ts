import { InvocationContext, HttpRequest } from "@azure/functions";
import { createUploadSas } from "../src/shared/blob";

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  try {
    const headers = req.headers as unknown as Record<string, string>;
    const eventId = context.bindingData.eventId;

    if (!eventId) {
      context.res = { status: 400, body: { error: "eventId is required" } };
      return;
    }

    let body: any;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
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

    const sas = await createUploadSas(eventId, body.fileName, body.contentType);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: sas,
    };
  } catch (err: any) {
    context.log("MediaSas error:", err?.message);
    context.res = {
      status: 500,
      body: { error: "Internal server error" },
    };
  }
}
