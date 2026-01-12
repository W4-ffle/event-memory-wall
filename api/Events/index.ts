import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";
import {
  json,
  badRequest,
  methodNotAllowed,
  serverError,
} from "../src/shared/http";

function getHeader(req: HttpRequest, name: string): string | undefined {
  // Runtime headers behave like a plain object in your deployment.
  const headers = req.headers as unknown as Record<string, any>;
  return (
    headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  );
}

function readJsonBody(req: HttpRequest): any {
  // Classic model: req.body is usually object or string
  const raw = (req as any).body;
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - stable");

  try {
    const hostId = getHeader(req, "x-host-id") || "demo-host";
    const container = await getEventsContainer();

    if (req.method === "GET") {
      const querySpec = {
        query:
          "SELECT * FROM c WHERE c.hostId = @hostId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@hostId", value: hostId }],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();
      json(context, 200, resources ?? []);
      return;
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      if (!body) {
        badRequest(context, "Invalid or missing JSON body");
        return;
      }

      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        badRequest(context, "title is required");
        return;
      }

      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;

      const doc = {
        id: eventId,
        eventId,
        hostId,
        title: body.title.trim(),
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        createdAt: now,
      };

      await container.items.create(doc);
      json(context, 201, doc);
      return;
    }

    methodNotAllowed(context);
  } catch (err: any) {
    context.log("Events error:", err?.message);
    context.log(err?.stack);
    serverError(context, err);
  }
}
