import type { HttpRequest, InvocationContext } from "@azure/functions";
import archiver from "archiver";
import { PassThrough } from "stream";

import { corsHeaders, handleOptions } from "../src/shared/http";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";
import { getMediaContainer } from "../src/shared/cosmos";
import { blobClientFromBlobUrl } from "../src/shared/blob";

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

export default async function (
  context: InvocationContext,
  req: HttpRequest
): Promise<void> {
  // CORS preflight
  if (handleOptions(context, req)) return;

  if (req.method !== "GET") {
    (context as any).res = {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: { error: "Method not allowed" },
    };
    return;
  }

  const hostId = getHeader(req as any, "x-host-id") || "demo-host";
  const eventId = String((context as any)?.bindingData?.eventId || "").trim();

  if (!eventId) {
    (context as any).res = {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: { error: "Bad Request", message: "eventId is required" },
    };
    return;
  }

  // ---- Auth ----
  const { userId, isAdmin } = getAuth(req as any);
  if (!requireLogin(userId)) {
    (context as any).res = {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: { error: "Login required" },
    };
    return;
  }

  // ---- Membership enforcement ----
  const ev = await loadEventByHostAndId(hostId, eventId);
  if (!ev || ev.status === "DELETED") {
    (context as any).res = {
      status: 404,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: { error: "Not found" },
    };
    return;
  }

  if (!isAdmin && !isMember(ev, userId)) {
    (context as any).res = {
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
  const items: Array<{
    mediaId: string;
    blobUrl: string;
    fileName?: string;
    contentType?: string;
    createdAt?: string;
  }> = resources ?? [];

  // ---- Prepare streaming ZIP response ----
  const zipNameBase = safeFileName(ev.title || "event");
  const zipFileName = `${zipNameBase}.zip`;

  const out = new PassThrough();

  // IMPORTANT:
  // Do NOT await stream completion in Azure Functions.
  // The host typically starts flushing the response after the function returns.
  (context as any).res = {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`,
      "Cache-Control": "no-store",
      // Optional but useful if you ever read filename client-side
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
    body: out,
    isRaw: true,
  };

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("warning", (err: any) => {
    context.log("ZIP warning:", err?.message || err);
  });

  archive.on("error", (err: any) => {
    context.log("ZIP error:", err?.message || err);
    try {
      out.destroy(err);
    } catch {}
  });

  out.on("error", (err: any) => {
    context.log("Response stream error:", err?.message || err);
    try {
      archive.abort();
    } catch {}
  });

  // Pipe archive into the HTTP response stream
  archive.pipe(out);

  const usedNames = new Set<string>();

  // If there are no items, add a tiny README so Windows sees a valid non-empty zip reliably
  if (!items.length) {
    archive.append("No media in this event.\n", { name: "README.txt" });
    archive.finalize(); // DO NOT await
    return; // allow host to stream
  }

  // Append each blob stream
  for (const it of items) {
    if (!it?.blobUrl) continue;

    const original = safeFileName(it.fileName || it.mediaId || "media");
    const ext = original.includes(".")
      ? ""
      : guessExtFromContentType(it.contentType);
    const entryName = uniqueName(usedNames, `${original}${ext}`);

    try {
      const blobClient = blobClientFromBlobUrl(it.blobUrl);
      const dl = await blobClient.download();
      const readable = dl.readableStreamBody;

      if (!readable) {
        context.log("No readableStreamBody for", it.mediaId);
        continue;
      }

      archive.append(readable as any, { name: entryName });
    } catch (e: any) {
      // Best-effort: skip broken blobs
      context.log("Failed to add blob:", it.mediaId, e?.message);
      continue;
    }
  }

  // Finalize signals “no more entries”
  archive.finalize(); // DO NOT await
  // Return immediately so the Functions host can flush the stream.
}
