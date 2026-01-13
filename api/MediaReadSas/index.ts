import { HttpRequest } from "@azure/functions";
import { makeReadSasFromBlobUrl } from "../src/shared/blob";
import { getMediaContainer } from "../src/shared/cosmos";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    const hostId = getHeader(req, "x-host-id") || "demo-host";

    const eventId = context?.bindingData?.eventId as string;
    const mediaId = context?.bindingData?.mediaId as string;

    if (!eventId || !mediaId) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "eventId and mediaId are required" },
      };
      return;
    }

    const container = await getMediaContainer();

    // We stored docs with id=mediaId and eventId, hostId, blobUrl, etc.
    // If your container is partitioned by hostId, item(mediaId, hostId) is ideal.
    // To avoid partition key typing/unknowns, use a query (CW2-safe).
    const querySpec = {
      query:
        "SELECT TOP 1 * FROM c WHERE c.hostId = @hostId AND c.eventId = @eventId AND c.mediaId = @mediaId",
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
        headers: { "Content-Type": "application/json" },
        body: { error: "Media not found" },
      };
      return;
    }

    const sas = makeReadSasFromBlobUrl(doc.blobUrl);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
