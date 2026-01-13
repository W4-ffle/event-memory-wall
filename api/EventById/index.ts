import { HttpRequest } from "@azure/functions";
import archiver from "archiver";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";
import { getMediaContainer } from "../src/shared/cosmos";
import { downloadBlobStreamFromBlobUrl } from "../src/shared/blob";

// ---- CORS ----
const ALLOWED_ORIGIN = "https://stgemwjb.z33.web.core.windows.net";
const ALLOWED_HEADERS = "Content-Type, x-host-id, x-user-id, x-admin-passcode";
const ALLOWED_METHODS = "GET,OPTIONS";

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

// minimal filename sanitizer for zip entries + header filename
function safeName(name: string) {
  const base = String(name || "file")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return base || "file";
}

type MediaDoc = {
  id: string;
  hostId: string;
  eventId: string;
  mediaId: string;
  blobUrl: string;
  fileName?: string;
  type?: "IMAGE" | "VIDEO";
  createdAt?: string;
  status?: string;
};

export default async function (context: any, req: HttpRequest): Promise<void> {
  try {
    if (handleOptions(context, req)) return;

    if (req.method !== "GET") {
      context.res = {
        status: 405,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Method not allowed" },
      };
      return;
    }

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";
    const eventId = (context?.bindingData?.eventId as string) || "";

    if (!eventId) {
      context.res = {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "eventId is required" },
      };
      return;
    }

    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      context.res = {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Login required" },
      };
      return;
    }

    // membership enforcement
    const ev = await loadEventByHostAndId(hostId, eventId);
    if (!ev || ev.status === "DELETED") {
      context.res = {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Not found" },
      };
      return;
    }

    if (!isAdmin && !isMember(ev, userId)) {
      context.res = {
        status: 403,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Forbidden" },
      };
      return;
    }

    // query all active media for event
    const container = await getMediaContainer();
    const querySpec = {
      query: `
        SELECT * FROM c
        WHERE c.hostId = @hostId
          AND c.eventId = @eventId
          AND (NOT IS_DEFINED(c.status) OR c.status != 'DELETED')
        ORDER BY c.createdAt ASC
      `,
      parameters: [
        { name: "@hostId", value: hostId },
        { name: "@eventId", value: eventId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    const items = (resources ?? []) as MediaDoc[];

    const zipFileName = safeName(`${ev.title || "event"}.zip`);

    // IMPORTANT: for streaming zip in Azure Functions, set `isRaw: true` and provide a readable stream in `body`.
    // Also set Content-Encoding: identity to avoid any middleware/proxy altering the payload.
    const pass = new (require("stream").PassThrough)();

    // create archive, pipe to pass-through
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("warning", (err: any) => {
      // warnings like missing file – log and continue
      context.log("ZIP warning:", err?.message || err);
    });

    archive.on("error", (err: any) => {
      context.log("ZIP error:", err?.message || err);
      try {
        pass.destroy(err);
      } catch {}
    });

    archive.pipe(pass);

    // append each file (best-effort)
    for (const m of items) {
      const entryName = safeName(m.fileName || `${m.mediaId}`);
      try {
        const stream = await downloadBlobStreamFromBlobUrl(m.blobUrl);
        if (stream) {
          archive.append(stream as any, { name: entryName });
        } else {
          archive.append("", { name: entryName });
        }
      } catch (e: any) {
        // include an error note instead of failing the whole zip
        archive.append(
          `Failed to include "${entryName}": ${String(e?.message ?? e)}`,
          { name: safeName(`ERROR_${entryName}.txt`) }
        );
      }
    }

    // finalize zip (CRITICAL)
    archive.finalize();

    context.res = {
      status: 200,
      isRaw: true,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
        "Cache-Control": "no-store",
        "Content-Encoding": "identity",
      },
      body: pass,
    };
  } catch (err: any) {
    context.log("EventDownload error:", err?.message);
    context.log(err?.stack);

    context.res = {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: {
        error: "Internal server error",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
