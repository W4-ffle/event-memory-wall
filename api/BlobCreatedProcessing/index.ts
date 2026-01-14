import { InvocationContext } from "@azure/functions";

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
};

export default async function (
  context: InvocationContext,
  event: EventGridEvent<BlobCreatedData>
): Promise<void> {
  context.log("BlobCreatedProcessing triggered");

  context.log("eventType:", event?.eventType);
  context.log("subject:", event?.subject);
  context.log("eventTime:", event?.eventTime);
  context.log("blob url:", event?.data?.url);

  // TODO: Add processing logic here (e.g., write metadata to Cosmos, generate thumbnail, etc.)
}
