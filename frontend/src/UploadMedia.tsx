import { useState } from "react";
import { apiPostRaw } from "./api";

type SasResponse = {
  // backend may return either name depending on your implementation
  uploadUrl?: string;
  url?: string;

  blobUrl: string;
  blobName?: string;
  expiresOn?: string;

  // only present if you implemented it server-side
  mediaId?: string;
};

export default function UploadMedia({
  eventId,
  onUploaded,
}: {
  eventId: string;
  onUploaded?: () => void;
}) {
  const [msg, setMsg] = useState<string>("");

  async function onPick(file: File | null) {
    if (!file) return;

    try {
      setMsg("Requesting upload URL...");

      // 1) Ask API for SAS URL
      const sas = (await apiPostRaw(`/events/${eventId}/media/sas`, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      })) as SasResponse;

      const uploadUrl = sas.uploadUrl || sas.url;
      if (!uploadUrl || !sas.blobUrl) {
        throw new Error(
          "SAS response missing uploadUrl/url or blobUrl. Check MediaSas response shape."
        );
      }

      // 2) Upload directly to Blob using SAS (browser PUT)
      setMsg("Uploading to Blob Storage...");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`Blob upload failed: ${putRes.status} ${text}`);
      }

      // 3) Store metadata in Cosmos
      setMsg("Saving metadata...");
      await apiPostRaw(`/events/${eventId}/media`, {
        mediaId: sas.mediaId || `media_${crypto.randomUUID()}`,
        blobUrl: sas.blobUrl,
        type: file.type.startsWith("video") ? "VIDEO" : "IMAGE",
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        createdAt: new Date().toISOString(),
      });

      setMsg("Done.");

      // 4) Trigger gallery refresh in parent
      onUploaded?.();
    } catch (e: any) {
      setMsg(e?.message || "Upload failed");
      throw e;
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label>
        <strong>Upload media:</strong>{" "}
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      <div style={{ marginTop: 8 }}>{msg}</div>
    </div>
  );
}
