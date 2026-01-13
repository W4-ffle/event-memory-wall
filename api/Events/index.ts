import { HttpRequest } from "@azure/functions";
import { randomUUID } from "crypto";
import { getEventsContainer } from "../src/shared/cosmos";
import { getAuth, requireLogin } from "../src/shared/auth";

// ---- CORS (must allow x-admin-passcode / x-user-id) ----
const ALLOWED_ORIGIN = "https://stgemwjb.z33.web.core.windows.net";
const ALLOWED_HEADERS = "Content-Type, x-host-id, x-user-id, x-admin-passcode";
const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
  };
}

function handleOptions(context: any, req: HttpRequest): boolean {
  if (req.method !== "OPTIONS") return false;

  context.res = {
    status: 204,
    headers: { ...corsHeaders() },
    body: "",
  };
  return true;
}

function send(context: any, status: number, body: any) {
  context.res = {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body,
  };
}

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

function readJsonBody(req: any): any | null {
  const raw = req?.body;
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

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    // ✅ browser preflight must be handled before anything else
    if (handleOptions(context, req)) return;

    const hostId = getHeader(req, "x-host-id") || "demo-host";
    const { userId, isAdmin } = getAuth(req);

    // For your requirement: users should only see events associated with them,
    // so login is required to list events.
    if (!requireLogin(userId)) {
      send(context, 401, { error: "Login required" });
      return;
    }

    const events = await getEventsContainer();

    // -------------------------
    // GET /v1/events
    // Admin: all events
    // User: only where memberIds contains userId
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
                AND ARRAY_CONTAINS(c.memberIds, @userId)
              ORDER BY c.createdAt DESC
            `,
            parameters: [
              { name: "@hostId", value: hostId },
              { name: "@userId", value: userId },
            ],
          };

      const { resources } = await events.items.query(querySpec).fetchAll();
      send(context, 200, resources ?? []);
      return;
    }

    // -------------------------
    // POST /v1/events
    // Admin-only creation is typical; if you want normal users creating events,
    // remove the admin check. For now: admin only.
    // -------------------------
    if (req.method === "POST") {
      if (!isAdmin) {
        send(context, 403, { error: "Admin only" });
        return;
      }

      const body = readJsonBody(req);
      if (!body) {
        send(context, 400, { error: "Invalid or missing JSON body" });
        return;
      }

      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        send(context, 400, { error: "title is required" });
        return;
      }

      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;

      // If you want the creating admin to automatically be a member:
      const memberIds = Array.isArray(body.memberIds)
        ? body.memberIds
        : [userId].filter(Boolean);

      const doc = {
        id: eventId,
        eventId,
        hostId,
        title: body.title.trim(),
        description: body.description || "",
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        visibility: body.visibility || "PRIVATE",
        status: "ACTIVE",
        memberIds, // ✅ used for user filtering
        createdAt: now,
      };

      await events.items.create(doc);
      send(context, 201, doc);
      return;
    }

    send(context, 405, { error: "Method not allowed" });
  } catch (err: any) {
    context.log("Events error:", err?.message);
    context.log(err?.stack);

    send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
