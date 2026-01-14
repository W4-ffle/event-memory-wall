import { app, InvocationContext } from "@azure/functions";

/**
 * Event Grid event payload shape (lightweight).
 * Storage BlobCreated data includes url, api, contentType, etc.
 */
type EventGridEvent<T = any> = {
  id: string;
  eventType: string;
  subject: string;
  eventTime: string;
  data: T;
  dataVersion?: string;
  metadataVersion?: string;
  topic?: string;
};

type BlobCreatedData = {
  url?: string;
  api?: string;
  contentType?: string;
  contentLength?: number;
  blobType?: string;
};

export async function blobCreatedProcessing(
  event: EventGridEvent<BlobCreatedData>,
  context: InvocationContext
): Promise<void> {
  context.log("EventGrid eventType:", event.eventType);
  context.log("Subject:", event.subject);
  context.log("Blob URL:", event.data?.url);

  // TODO: Implement your processing:
  // - generate thumbnail
  // - extract metadata
  // - update Cosmos doc
  // - enqueue a message, etc.
}

app.eventGrid("blob-created-processing", {
  handler: blobCreatedProcessing,
});
