import { HttpRequest } from "@azure/functions";
import { getEventsContainer, getMediaContainer } from "../src/shared/cosmos";
import { deleteBlobIfPossible } from "../src/shared/blob";
import { getAuth, requireAdmin, requireLogin } from "../src/shared/auth";

// ---- CORS (must allow x-admin-passcode or browser preflight will fail) ----
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

function send(context: any, status: number, body: any) {
  context.res = {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
    body,
  };
}

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    // ✅ must handle browser preflight first
    if (handleOptions(context, req)) return;

    const eventId = (context?.bindingData?.eventId as string) || "";
    if (!eventId) {
      send(context, 400, { error: "eventId is required" });
      return;
    }

    const hostId =
      ((req.headers as unknown as Record<string, any>)["x-host-id"] as
        | string
        | undefined) || "demo-host";

    const { userId, isAdmin } = getAuth(req);

    if (!requireLogin(userId)) {
      send(context, 401, { error: "Login required" });
      return;
    }

    const events = await getEventsContainer();

    // Helper: load event (optionally include deleted)
    async function loadEvent(includeDeleted: boolean) {
      const q = {
        query: `
          SELECT TOP 1 * FROM c
          WHERE c.hostId = @hostId
            AND c.eventId = @eventId
            ${
              includeDeleted
                ? ""
                : "AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')"
            }
        `,
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources } = await events.items.query(q).fetchAll();
      return resources?.[0] ?? null;
    }

    // Membership check
    function isMember(ev: any): boolean {
      const members: any[] = ev?.memberIds ?? [];
      return Array.isArray(members) && members.includes(userId);
    }

    // -------------------------
    // GET /v1/events/{eventId}
    // -------------------------
    if (req.method === "GET") {
      const ev = await loadEvent(false);
      if (!ev) {
        send(context, 404, { error: "Not found" });
        return;
      }

      // Admin can view any event; normal user must be a member
      if (!isAdmin && !isMember(ev)) {
        send(context, 403, { error: "Forbidden" });
        return;
      }

      send(context, 200, ev);
      return;
    }

    // -------------------------
    // PATCH /v1/events/{eventId} (ADMIN ONLY)
    // -------------------------
    if (req.method === "PATCH") {
      if (!requireAdmin(isAdmin)) {
        send(context, 403, { error: "Admin only" });
        return;
      }

      const body = readJsonBody(req);
      if (!body) {
        send(context, 400, { error: "Invalid or missing JSON body" });
        return;
      }

      const current = await loadEvent(true);
      if (!current || current.status === "DELETED") {
        send(context, 404, { error: "Not found" });
        return;
      }

      const updated = {
        ...current,
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : current.title,
        description:
          typeof body.description === "string"
            ? body.description
            : current.description,
        startsAt: body.startsAt ?? current.startsAt,
        endsAt: body.endsAt ?? current.endsAt,
        visibility:
          typeof body.visibility === "string"
            ? body.visibility
            : current.visibility,
        updatedAt: new Date().toISOString(),
      };

      await events.items.upsert(updated);
      send(context, 200, updated);
      return;
    }

    // -------------------------
    // DELETE /v1/events/{eventId} (ADMIN ONLY)
    // Soft delete event + media + best-effort blob delete
    // -------------------------
    if (req.method === "DELETE") {
      if (!requireAdmin(isAdmin)) {
        send(context, 403, { error: "Admin only" });
        return;
      }

      const media = await getMediaContainer();

      const ev = await loadEvent(true);
      if (!ev || ev.status === "DELETED") {
        send(context, 404, { error: "Not found" });
        return;
      }

      const now = new Date().toISOString();

      // Soft-delete event
      await events.items.upsert({
        ...ev,
        status: "DELETED",
        deletedAt: now,
      });

      // Soft-delete media docs for this event (and try to delete blobs)
      const mediaQuery = {
        query: `
          SELECT * FROM c
          WHERE c.hostId = @hostId
            AND c.eventId = @eventId
            AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
          ORDER BY c.createdAt DESC
        `,
        parameters: [
          { name: "@hostId", value: hostId },
          { name: "@eventId", value: eventId },
        ],
      };

      const { resources: mediaDocs } = await media.items
        .query(mediaQuery)
        .fetchAll();

      let deletedMediaCount = 0;
      let blobDeleteFailures = 0;

      for (const m of mediaDocs ?? []) {
        await media.items.upsert({
          ...m,
          status: "DELETED",
          deletedAt: now,
        });
        deletedMediaCount++;

        try {
          if (m.blobUrl) await deleteBlobIfPossible(m.blobUrl);
        } catch {
          blobDeleteFailures++;
        }
      }

      send(context, 200, {
        ok: true,
        eventId,
        deletedMediaCount,
        blobDeleteFailures,
      });
      return;
    }

    send(context, 405, { error: "Method not allowed" });
  } catch (err: any) {
    context.log("EventById error:", err?.message);
    context.log(err?.stack);

    send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
