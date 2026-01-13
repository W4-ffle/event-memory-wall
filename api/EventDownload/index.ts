import type { InvocationContext, HttpRequest } from "@azure/functions";
import archiver from "archiver";
import { PassThrough } from "stream";
import { getAuth, requireLogin, getHeader } from "../src/shared/auth";
import { loadEventByHostAndId, isMember } from "../src/shared/eventAccess";
import { getMediaContainer } from "../src/shared/cosmos";
import { blobClientFromBlobUrl } from "../src/shared/blob";
import {
  corsHeaders,
  handleOptions,
  json,
  methodNotAllowed,
  serverError,
} from "../src/shared/http";

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
  try {
    if (handleOptions(context, req)) return;

    if (req.method !== "GET") {
      methodNotAllowed(context);
      return;
    }

    const hostId = getHeader(req as any, "x-host-id") || "demo-host";
    const eventId = (context as any)?.bindingData?.eventId as string;

    if (!eventId) {
      json(context, 400, {
        error: "Bad Request",
        message: "eventId is required",
      });
      return;
    }

    // ---- Auth ----
    const { userId, isAdmin } = getAuth(req);
    if (!requireLogin(userId)) {
      json(context, 401, { error: "Login required" });
      return;
    }

    // ---- Membership enforcement ----
    const ev = await loadEventByHostAndId(hostId, eventId);
    if (!ev || ev.status === "DELETED") {
      json(context, 404, { error: "Not found" });
      return;
    }

    if (!isAdmin && !isMember(ev, userId)) {
      json(context, 403, { error: "Forbidden" });
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

    const zipNameBase = safeFileName(ev.title || "event");
    const zipFileName = `${zipNameBase}.zip`;

    // Streaming ZIP
    const out = new PassThrough();

    (context as any).res = {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
      },
      body: out,
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
        const blobClient = blobClientFromBlobUrl(it.blobUrl);
        const dl = await blobClient.download();
        const readable = dl.readableStreamBody;

        if (!readable) {
          context.log("No readableStreamBody for", it.mediaId);
          continue;
        }

        archive.append(readable as any, { name: entryName });
      } catch (e: any) {
        context.log("Failed to add blob to ZIP:", it.mediaId, e?.message);
        continue;
      }
    }

    await archive.finalize();
  } catch (err: any) {
    serverError(context, err);
  }
}
