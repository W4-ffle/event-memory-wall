import { getEventsContainer } from "./cosmos";

export async function loadEventByHostAndId(hostId: string, eventId: string) {
  const events = await getEventsContainer();

  const q = {
    query: `
      SELECT TOP 1 * FROM c
      WHERE c.hostId = @hostId AND c.eventId = @eventId
    `,
    parameters: [
      { name: "@hostId", value: hostId },
      { name: "@eventId", value: eventId },
    ],
  };

  const { resources } = await events.items.query(q).fetchAll();
  return resources?.[0] ?? null;
}

export function isMember(ev: any, userId: string): boolean {
  const members = ev?.memberIds;
  if (!Array.isArray(members)) return false;
  return members.map(String).includes(String(userId));
}
