import { CosmosClient, Container } from "@azure/cosmos";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const endpoint = required("COSMOS_ENDPOINT");
const key = required("COSMOS_KEY");
const databaseId = required("COSMOS_DATABASE");
const eventsContainerId = required("COSMOS_EVENTS_CONTAINER");
const mediaContainerId = required("COSMOS_MEDIA_CONTAINER");

// ✅ Single shared client (important for Azure Functions)
const client = new CosmosClient({ endpoint, key });

function getDatabase() {
  return client.database(databaseId);
}

export async function getEventsContainer(): Promise<Container> {
  return getDatabase().container(eventsContainerId);
}

export async function getMediaContainer(): Promise<Container> {
  return getDatabase().container(mediaContainerId);
}
