import { HttpRequest } from "@azure/functions";
import { getEventsContainer } from "../src/shared/cosmos";
import {
  getAuth,
  requireAdmin,
  requireLogin,
  getHeader,
} from "../src/shared/auth";

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
    headers: { "Content-Type": "application/json" },
    body,
  };
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
    const hostId = getHeader(req as any, "x-host-id") || "demo-host";
    const eventId = String(
      (context?.bindingData?.eventId as string) || ""
    ).trim();
    if (!eventId) return send(context, 400, { error: "eventId is required" });

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId))
      return send(context, 401, { error: "Login required" });
    if (!requireAdmin(isAdmin))
      return send(context, 403, { error: "Admin only" });

    const body = readJsonBody(req);
    if (!body)
      return send(context, 400, { error: "Invalid or missing JSON body" });

    // Accept either full replacement or add/remove operations.
    // 1) Replace: { memberIds: ["u1","u2"] }
    // 2) Patch:   { add: ["u3"], remove: ["u1"] }
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
    const ev = resources?.[0];
    if (!ev || ev.status === "DELETED")
      return send(context, 404, { error: "Not found" });

    const current = Array.isArray(ev.memberIds) ? ev.memberIds.map(String) : [];
    let next: string[] = current;

    if (Array.isArray(body.memberIds)) {
      // Replace
      next = uniqueStrings([userId, ...body.memberIds]);
    } else {
      const add = Array.isArray(body.add) ? body.add : [];
      const remove = Array.isArray(body.remove) ? body.remove : [];
      const addSet = uniqueStrings(add);
      const removeSet = new Set(uniqueStrings(remove));

      next = uniqueStrings([...current, ...addSet]).filter(
        (m) => !removeSet.has(m)
      );
      // Ensure owner/admin stays a member
      if (!next.includes(userId)) next.unshift(userId);
      if (ev.ownerId && !next.includes(String(ev.ownerId)))
        next.unshift(String(ev.ownerId));
    }

    const updated = {
      ...ev,
      memberIds: next,
      updatedAt: new Date().toISOString(),
    };

    await events.items.upsert(updated);
    return send(context, 200, {
      ok: true,
      eventId,
      memberIds: updated.memberIds,
    });
  } catch (err: any) {
    context.log("EventMembers error:", err?.message);
    context.log(err?.stack);
    return send(context, 500, {
      error: "Internal server error",
      message: err?.message ?? "Unknown error",
    });
  }
}
