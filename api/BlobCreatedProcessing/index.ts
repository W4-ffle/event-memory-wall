import type { InvocationContext } from "@azure/functions";

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
  event: EventGridEvent<BlobCreatedData>,
  context: InvocationContext
) {
  context.log("BlobCreatedProcessing triggered");
  context.log("eventType:", event?.eventType);
  context.log("subject:", event?.subject);
  context.log("url:", event?.data?.url);

  // TODO: do your processing here
}
