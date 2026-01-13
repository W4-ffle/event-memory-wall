import { HttpRequest } from "@azure/functions";
import { getEventsContainer } from "../src/shared/cosmos";

function header(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

function readJsonBody(req: HttpRequest): any | null {
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

function isIsoDateOrNull(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  // lightweight check; good enough for CW2
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  context.log("EventById handler reached");

  try {
    const eventId = context?.bindingData?.eventId;
    if (!eventId) {
      context.res = { status: 400, body: { error: "eventId is required" } };
      return;
    }

    const hostId = header(req, "x-host-id") || "demo-host";
    const container = await getEventsContainer();

    // --- READ existing doc (by id + partition key) ---
    const item = container.item(eventId, hostId);
    const { resource: existing } = await item.read();

    if (!existing) {
      context.res = { status: 404, body: { error: "Not found" } };
      return;
    }

    // Optional: prevent updates to deleted events
    if (existing.status && existing.status !== "ACTIVE") {
      context.res = { status: 404, body: { error: "Not found" } };
      return;
    }

    // --- GET /v1/events/{eventId} (optional but handy) ---
    if (req.method === "GET") {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: existing,
      };
      return;
    }

    // --- UPDATE: PATCH/PUT ---
    if (req.method === "PATCH" || req.method === "PUT") {
      const body = readJsonBody(req);
      if (!body) {
        context.res = { status: 400, body: { error: "Invalid JSON body" } };
        return;
      }

      // Validate only what is provided
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim()) {
          context.res = {
            status: 400,
            body: { error: "title must be a non-empty string" },
          };
          return;
        }
      }

      if (
        body.description !== undefined &&
        typeof body.description !== "string"
      ) {
        context.res = {
          status: 400,
          body: { error: "description must be a string" },
        };
        return;
      }

      if (body.visibility !== undefined) {
        const v = String(body.visibility);
        const allowed = new Set(["PRIVATE", "PUBLIC"]);
        if (!allowed.has(v)) {
          context.res = {
            status: 400,
            body: { error: "visibility must be PRIVATE or PUBLIC" },
          };
          return;
        }
      }

      if (!isIsoDateOrNull(body.startsAt) || !isIsoDateOrNull(body.endsAt)) {
        context.res = {
          status: 400,
          body: { error: "startsAt/endsAt must be ISO string or null" },
        };
        return;
      }

      const updated = {
        ...existing,

        // only overwrite when provided
        title:
          body.title !== undefined ? String(body.title).trim() : existing.title,
        description:
          body.description !== undefined
            ? String(body.description)
            : existing.description ?? "",
        startsAt:
          body.startsAt !== undefined
            ? body.startsAt
            : existing.startsAt ?? null,
        endsAt:
          body.endsAt !== undefined ? body.endsAt : existing.endsAt ?? null,
        visibility:
          body.visibility !== undefined
            ? String(body.visibility)
            : existing.visibility ?? "PRIVATE",

        updatedAt: new Date().toISOString(),
      };

      await item.replace(updated);

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: updated,
      };
      return;
    }

    // DELETE handled elsewhere by you (you said it’s done)
    context.res = { status: 405, body: { error: "Method not allowed" } };
  } catch (err: any) {
    context.log("EventById FAILED:", err?.message);
    context.log(err?.stack);

    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
