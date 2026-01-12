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

  const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sas}`;
  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

  return { url, blobUrl, expiresOn: expiresOn.toISOString() };
}
