import {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { env } from "../src/shared/env";

function getHeader(req: any, name: string): string | undefined {
  const h = (req?.headers ?? {}) as Record<string, any>;
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
}

function parseJsonBody(req: any): any | null {
  const raw = req?.body;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Web Crypto UUID (no Node import)
function uuid(): string {
  // crypto.randomUUID exists in modern runtimes (and TS knows it via DOM lib)
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  // Fallback (good enough for CW2)
  const s = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
}

export default async function (context: any, req: any): Promise<void> {
  try {
    const eventId = context?.bindingData?.eventId as string;
    if (!eventId) {
      context.res = {
        status: 400,
        body: { error: "eventId missing in route" },
      };
      return;
    }

    const hostId = getHeader(req, "x-host-id") || "demo-host";

    const body = parseJsonBody(req);
    if (!body?.fileName || !body?.contentType) {
      context.res = {
        status: 400,
        body: { error: "fileName and contentType are required" },
      };
      return;
    }

    const account = env("STORAGE_ACCOUNT_NAME");
    const key = env("STORAGE_ACCOUNT_KEY");
    const containerName = env("MEDIA_CONTAINER_NAME");

    if (!account || !key || !containerName) {
      context.res = {
        status: 500,
        body: {
          error:
            "Missing STORAGE_ACCOUNT_NAME / STORAGE_ACCOUNT_KEY / MEDIA_CONTAINER_NAME",
        },
      };
      return;
    }

    const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobName = `${hostId}/${eventId}/${uuid()}_${safeName}`;

    const credential = new StorageSharedKeyCredential(account, key);
    const expiresOn = new Date(Date.now() + 10 * 60 * 1000);

    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"),
        expiresOn,
      },
      credential
    ).toString();

    const blobUrl = `https://${account}.blob.core.windows.net/${containerName}/${blobName}`;
    const uploadUrl = `${blobUrl}?${sas}`;

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        uploadUrl,
        blobUrl,
        blobName,
        expiresOn: expiresOn.toISOString(),
      },
    };
  } catch (err: any) {
    context.log("MediaSas error:", err?.message);
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
