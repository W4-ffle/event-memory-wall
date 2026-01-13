import { HttpRequest } from "@azure/functions";
import { randomUUID } from "crypto";
import { getMediaContainer } from "../src/shared/cosmos";

function header(req: any, name: string) {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  context.log("media handler reached");

  try {
    const eventId = context?.bindingData?.eventId;
    if (!eventId) {
      context.res = { status: 400, body: { error: "eventId is required" } };
      return;
    }

    const hostId = header(req, "x-host-id") || "demo-host";
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
        headers: { "Content-Type": "application/json" },
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
        context.res = { status: 400, body: { error: "Invalid JSON body" } };
        return;
      }

      if (!body?.blobUrl || !body?.fileName) {
        context.res = {
          status: 400,
          body: { error: "blobUrl and fileName are required" },
        };
        return;
      }

      const now = new Date().toISOString();
      const mediaId = body.mediaId || `media_${randomUUID()}`;

      const doc = {
        id: mediaId, // Cosmos id
        mediaId, // app id
        hostId,
        eventId,
        uploaderId: body.uploaderId || "anonymous",
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
        headers: { "Content-Type": "application/json" },
        body: doc,
      };
      return;
    }

    context.res = { status: 405, body: { error: "Method not allowed" } };
  } catch (err: any) {
    context.log("MEDIA FAILED:", err?.message);
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
