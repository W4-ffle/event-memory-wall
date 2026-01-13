import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  BlobServiceClient,
  BlobClient,
} from "@azure/storage-blob";
import type { Readable } from "stream";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getCred() {
  const accountName = required("STORAGE_ACCOUNT_NAME");
  const accountKey = required("STORAGE_ACCOUNT_KEY");
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  return { accountName, cred };
}

/**
 * Create a short-lived SAS URL for uploading (create + write).
 * Returns:
 *  - url: full SAS URL to PUT to
 *  - blobUrl: base URL (no SAS)
 *  - expiresOn
 */
export function makeUploadSas(blobName: string) {
  const { accountName, cred } = getCred();
  const containerName = required("MEDIA_CONTAINER_NAME");

  const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"), // create + write
      expiresOn,
    },
    cred
  ).toString();

  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;
  const url = `${blobUrl}?${sas}`;

  return { url, blobUrl, expiresOn: expiresOn.toISOString() };
}

/**
 * Create a short-lived SAS URL for reading (read-only) from a stored blobUrl.
 * Returns:
 *  - readUrl: full SAS URL to GET
 *  - expiresOn
 */
export function makeReadSasFromBlobUrl(blobUrl: string) {
  const { accountName, cred } = getCred();
  const containerName = required("MEDIA_CONTAINER_NAME");

  // Expecting blobUrl like:
  // https://{account}.blob.core.windows.net/{container}/{blobName...}
  const marker = `/${containerName}/`;
  const idx = blobUrl.indexOf(marker);
  if (idx === -1) {
    throw new Error("blobUrl does not contain expected container path");
  }

  const blobName = blobUrl.substring(idx + marker.length);

  const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"), // read-only
      expiresOn,
    },
    cred
  ).toString();

  const readUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sas}`;
  return { readUrl, expiresOn: expiresOn.toISOString() };
}

function parseBlobUrl(blobUrl: string): {
  container: string;
  blobName: string;
} {
  const u = new URL(blobUrl);
  // pathname: /<container>/<blobName...>
  const parts = u.pathname.replace(/^\/+/, "").split("/");
  const container = parts.shift() || "";
  const blobName = parts.join("/");
  return { container, blobName };
}

/**
 * Best-effort blob delete by URL. Use inside a try/catch and do not fail the whole request if it errors.
 * This uses the account key (server-side), so it can delete even when the container is private.
 */
export async function deleteBlobIfPossible(blobUrl: string): Promise<void> {
  const { accountName, cred } = getCred();

  const { container, blobName } = parseBlobUrl(blobUrl);
  if (!container || !blobName) return;

  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    cred
  );

  const blobClient = service
    .getContainerClient(container)
    .getBlobClient(blobName);

  // deleteIfExists avoids throwing if it's already gone (common with retries)
  await blobClient.deleteIfExists();
}

/**
 * FIXED: Create an authenticated BlobClient from a plain blobUrl (no SAS).
 * This MUST use account key credentials server-side; anonymous will not work
 * for private containers and can lead to downloading HTML error pages elsewhere.
 */
export function blobClientFromBlobUrl(blobUrl: string): BlobClient {
  const { accountName, cred } = getCred();

  const { container, blobName } = parseBlobUrl(blobUrl);
  if (!container || !blobName) {
    throw new Error("Invalid blobUrl (missing container/blobName)");
  }

  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    cred
  );

  return service.getContainerClient(container).getBlobClient(blobName);
}

/**
 * FIXED: Download a readable stream for a blobUrl (no SAS), authenticated server-side.
 */
export async function downloadBlobStreamFromBlobUrl(
  blobUrl: string
): Promise<Readable | null> {
  const { accountName, cred } = getCred();

  const { container, blobName } = parseBlobUrl(blobUrl);
  if (!container || !blobName) return null;

  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    cred
  );

  const blobClient = service
    .getContainerClient(container)
    .getBlobClient(blobName);

  const resp = await blobClient.download();
  return (resp.readableStreamBody as any) || null;
}
