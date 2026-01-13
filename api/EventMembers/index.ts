import { HttpRequest } from "@azure/functions";
import { getEventsContainer } from "../src/shared/cosmos";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";

// ---- CORS ----
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
  context.res = { status: 204, headers: { ...corsHeaders() }, body: "" };
  return true;
}

function send(context: any, status: number, body: any) {
  context.res = {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body,
  };
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

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    if (handleOptions(context, req)) return;

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";
    const eventId = (context?.bindingData?.eventId as string) || "";
    const memberIdFromRoute = (context?.bindingData?.memberId as string) || "";

    if (!eventId) {
      send(context, 400, { error: "eventId is required" });
      return;
    }

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      send(context, 401, { error: "Login required" });
      return;
    }

    // Load event + enforce existence
    const ev = await loadEventByHostAndId(hostId, eventId);
    if (!ev || ev.status === "DELETED") {
      send(context, 404, { error: "Not found" });
      return;
    }

    // Access rule: admin OR member can manage members
    // (this implements: creator can add, members can add)
    if (!isAdmin && !isMember(ev, userId)) {
      send(context, 403, { error: "Forbidden" });
      return;
    }

    const events = await getEventsContainer();

    // ------------------------------------------
    // POST /v1/events/{eventId}/members
    // body: { memberId?: string, memberIds?: string[] }
    // ------------------------------------------
    if (req.method === "POST") {
      const body = readJsonBody(req);
      if (!body) {
        send(context, 400, { error: "Invalid or missing JSON body" });
        return;
      }

      const candidates = uniqueStrings([
        ...(Array.isArray(body.memberIds) ? body.memberIds : []),
        ...(body.memberId ? [body.memberId] : []),
      ]);

      if (!candidates.length) {
        send(context, 400, { error: "memberId or memberIds is required" });
        return;
      }

      // Always keep owner in list, never remove via add
      const currentMembers = Array.isArray(ev.memberIds) ? ev.memberIds : [];
      const nextMembers = uniqueStrings([
        ev.ownerId,
        ...currentMembers,
        ...candidates,
      ]);

      const updated = {
        ...ev,
        memberIds: nextMembers,
        updatedAt: new Date().toISOString(),
      };

      await events.items.upsert(updated);

      send(context, 200, {
        ok: true,
        eventId,
        memberIds: updated.memberIds,
      });
      return;
    }

    // ------------------------------------------
    // DELETE /v1/events/{eventId}/members/{memberId}
    // Optional: allow members to remove members.
    // Safeguards:
    // - cannot remove owner
    // - cannot remove yourself (prevents self-lockout)
    // - admin can remove anyone except owner
    // ------------------------------------------
    if (req.method === "DELETE") {
      if (!memberIdFromRoute) {
        send(context, 400, { error: "memberId is required in route" });
        return;
      }

      const target = String(memberIdFromRoute).trim();
      if (!target) {
        send(context, 400, { error: "memberId is required" });
        return;
      }

      if (target === ev.ownerId) {
        send(context, 400, { error: "Cannot remove owner" });
        return;
      }

      if (!isAdmin && target === userId) {
        send(context, 400, { error: "You cannot remove yourself" });
        return;
      }

      const currentMembers = Array.isArray(ev.memberIds) ? ev.memberIds : [];
      const nextMembers = currentMembers.filter(
        (m: any) => String(m) !== target
      );

      const updated = {
        ...ev,
        memberIds: uniqueStrings([ev.ownerId, ...nextMembers]),
        updatedAt: new Date().toISOString(),
      };

      await events.items.upsert(updated);

      send(context, 200, {
        ok: true,
        eventId,
        memberIds: updated.memberIds,
      });
      return;
    }

    send(context, 405, { error: "Method not allowed" });
  } catch (err: any) {
    context.log("EventMembers error:", err?.message);
    context.log(err?.stack);

    send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
