import {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getEventsContainer } from "../src/shared/cosmos";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const container = await getEventsContainer();
  const eventId = (request.params as any)?.eventId;
  if (!eventId) {
    return {
      status: 400,
      jsonBody: { error: "eventId route parameter is required" },
    };
  }

  const hostId = request.headers.get("x-host-id") || "demo-host";

  const item = container.item(eventId, hostId);

  if (request.method === "PATCH") {
    const { resource } = await item.read();
    if (!resource) {
      return { status: 404, jsonBody: { error: "Not found" } };
    }

    const body = (await request.json().catch(() => ({}))) as any;

    const updated = {
      ...resource,
      title: body.title ?? resource.title,
      description: body.description ?? resource.description,
      startsAt: body.startsAt ?? resource.startsAt,
      endsAt: body.endsAt ?? resource.endsAt,
      visibility: body.visibility ?? resource.visibility,
    };

    await item.replace(updated);
    return { status: 200, jsonBody: updated };
  }

  if (request.method === "DELETE") {
    await item.delete();
    return { status: 204 };
  }

  return { status: 405, jsonBody: { error: "Method not allowed" } };
}
