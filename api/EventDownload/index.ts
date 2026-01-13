import type { HttpRequest } from "@azure/functions";
import archiver from "archiver";
import { PassThrough } from "stream";

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

// ---- helpers ----
function safeFileName(name: string): string {
  const base = String(name || "file")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return base.length ? base : "file";
}

function guessExtFromContentType(ct?: string): string {
  const s = String(ct || "").toLowerCase();
  if (s.includes("image/jpeg")) return ".jpg";
  if (s.includes("image/png")) return ".png";
  if (s.includes("image/gif")) return ".gif";
  if (s.includes("image/webp")) return ".webp";
  if (s.includes("video/mp4")) return ".mp4";
  if (s.includes("video/quicktime")) return ".mov";
  return "";
}

function uniqueName(used: Set<string>, desired: string): string {
  if (!used.has(desired)) {
    used.add(desired);
    return desired;
  }
  const dot = desired.lastIndexOf(".");
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";

  let i = 2;
  while (used.has(`${stem}_${i}${ext}`)) i++;
  const next = `${stem}_${i}${ext}`;
  used.add(next);
  return next;
}

/**
 * Build the zip fully into a Buffer (more reliable on Azure Functions than streaming raw zip output).
 * Note: this is memory-bound; if you expect very large events, we can switch to temp-file streaming.
 */
async function buildZipBuffer(context: any, items: Array<any>) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const out = new PassThrough();

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    out.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    out.on("end", () => resolve(Buffer.concat(chunks)));
    out.on("error", reject);
  });

  archive.on("warning", (err: any) => {
    context.log("ZIP warning:", err?.message || err);
  });

  archive.on("error", (err: any) => {
    context.log("ZIP error:", err?.message || err);
    out.destroy(err);
  });

  archive.pipe(out);

  const usedNames = new Set<string>();

  for (const it of items) {
    if (!it?.blobUrl) continue;

    const original = safeFileName(it.fileName || it.mediaId || "media");
    const ext = original.includes(".")
      ? ""
      : guessExtFromContentType(it.contentType);

    const desired = `${original}${ext}`;
    const entryName = uniqueName(usedNames, desired);

    try {
      const readable = await downloadBlobStreamFromBlobUrl(it.blobUrl);
      if (!readable) {
        context.log("No readable stream for", it.mediaId);
        continue;
      }
      archive.append(readable as any, { name: entryName });
    } catch (e: any) {
      context.log("Failed to add blob to ZIP:", it.mediaId, e?.message || e);
      continue;
    }
  }

  await archive.finalize();
  return await done;
}

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

    // ---- Auth ----
    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      context.res = {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: { error: "Login required" },
      };
      return;
    }

    // ---- Membership enforcement ----
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

    // ---- Load media list (exclude DELETED) ----
    const media = await getMediaContainer();
    const querySpec = {
      query: `
        SELECT c.mediaId, c.blobUrl, c.fileName, c.contentType, c.createdAt
        FROM c
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

    const { resources } = await media.items.query(querySpec).fetchAll();
    const items = resources ?? [];

    const zipNameBase = safeFileName(ev.title || "event");
    const zipFileName = `${zipNameBase}.zip`;

    const zipBuffer = await buildZipBuffer(context, items);

    context.res = {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
        "Cache-Control": "no-store",
      },
      // Important: prevent string/JSON coercion
      isRaw: true,
      body: zipBuffer,
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
