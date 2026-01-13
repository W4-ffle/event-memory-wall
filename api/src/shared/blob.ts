import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Creates a short-lived SAS upload URL for a single blob.
 * Returns both uploadUrl (includes SAS) and blobUrl (no SAS).
 */
export function makeUploadSas(blobName: string) {
  const accountName = required("STORAGE_ACCOUNT_NAME");
  const accountKey = required("STORAGE_ACCOUNT_KEY");
  const containerName = required("MEDIA_CONTAINER_NAME");

  const cred = new StorageSharedKeyCredential(accountName, accountKey);

  const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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
  const uploadUrl = `${blobUrl}?${sas}`;

  return {
    uploadUrl, // what the frontend should PUT to
    blobUrl, // permanent URL (no SAS)
    blobName,
    containerName,
    expiresOn: expiresOn.toISOString(),
  };
}
