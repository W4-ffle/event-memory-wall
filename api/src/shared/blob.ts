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

function getCred() {
  const accountName = required("STORAGE_ACCOUNT_NAME");
  const accountKey = required("STORAGE_ACCOUNT_KEY");
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  return { accountName, cred };
}

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

  const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sas}`;
  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

  return { url, blobUrl, expiresOn: expiresOn.toISOString() };
}

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
