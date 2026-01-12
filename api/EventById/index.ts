import { HttpRequest, InvocationContext } from "@azure/functions";
import { getEventsContainer } from "../src/shared/cosmos";
import { json, serverError } from "../src/shared/http";

export default async function (req: HttpRequest, context: InvocationContext) {
  try {
    const container = await getEventsContainer();
    const hostId = req.headers.get("x-host-id") || "demo-host";

    // eventId comes from the route parameter
    const eventId =
      (context as any)?.bindingData?.eventId ||
      (context as any)?.bindingData?.id;

    if (!eventId) {
      json(context, 400, { error: "Bad Request", message: "Missing eventId" });
      return;
    }

    // We store id == eventId, so read by id.
    // If your container is partitioned by hostId, keep hostId here.
    const { resource } = await container.item(eventId, hostId).read();

    if (!resource) {
      json(context, 404, { error: "Not Found" });
      return;
    }

    json(context, 200, resource);
  } catch (err: any) {
    context.log("EventById error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
