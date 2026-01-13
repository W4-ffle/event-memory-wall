// api/Events/index.ts
import { HttpRequest, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import {
  json,
  badRequest,
  methodNotAllowed,
  serverError,
} from "../src/shared/http";

function readJsonBody(req: HttpRequest): any {
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

function uniqueStrings(xs: any[]): string[] {
  return Array.from(
    new Set(
      (xs ?? [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  context.log("Events handler reached - stable");

  try {
    const hostId = getHeader(req as any, "x-host-id") || "demo-host";

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      json(context, 401, { error: "Login required" });
      return;
    }

    const events = await getEventsContainer();

    // -------------------------
    // GET /v1/events
    // Admin: all events for host
    // User: only events where memberIds contains userId
    // -------------------------
    if (req.method === "GET") {
      const querySpec = isAdmin
        ? {
            query: `
              SELECT * FROM c
              WHERE c.hostId = @hostId
                AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
              ORDER BY c.createdAt DESC
            `,
            parameters: [{ name: "@hostId", value: hostId }],
          }
        : {
            query: `
              SELECT * FROM c
              WHERE c.hostId = @hostId
                AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
                AND IS_DEFINED(c.memberIds)
                AND ARRAY_CONTAINS(c.memberIds, @userId)
              ORDER BY c.createdAt DESC
            `,
            parameters: [
              { name: "@hostId", value: hostId },
              { name: "@userId", value: userId },
            ],
          };

      const { resources } = await events.items.query(querySpec).fetchAll();
      json(context, 200, resources ?? []);
      return;
    }

    // -------------------------
    // POST /v1/events
    // Any logged-in user can create an event.
    // Creator becomes owner + first member.
    // (Admins still do NOT automatically get edit/delete unless you keep those checks elsewhere.)
    // -------------------------
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
      const newEventId = `event_${randomUUID()}`;

      // Optional: allow creator to add other members at creation time.
      // If you don't want that yet, just keep memberIds: [userId].
      const requestedMembers = Array.isArray(body.memberIds)
        ? uniqueStrings(body.memberIds)
        : [];

      const doc = {
        id: newEventId,
        eventId: newEventId,
        hostId,
        title: body.title.trim(),
        description:
          typeof body.description === "string" ? body.description : "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        status: "ACTIVE",
        createdAt: now,

        // ownership/membership
        ownerId: userId,
        memberIds: uniqueStrings([userId, ...requestedMembers]),
      };

      await events.items.create(doc);
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
