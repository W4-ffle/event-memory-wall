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

const client = new CosmosClient({ endpoint, key });

export async function getEventsContainer(): Promise<Container> {
  const db = client.database(databaseId);
  return db.container(eventsContainerId);
}

export async function getMediaContainer() {
  const client = new CosmosClient({
    endpoint: required("COSMOS_ENDPOINT"),
    key: required("COSMOS_KEY"),
  });

  const db = client.database(required("COSMOS_DATABASE"));
  return db.container(required("COSMOS_MEDIA_CONTAINER"));
}
