import { useState } from "react";
import { apiPostRaw } from "./api";

export default function UploadMedia({ eventId }: { eventId: string }) {
  const [msg, setMsg] = useState<string>("");

  async function onPick(file: File | null) {
    if (!file) return;

    setMsg("Requesting upload URL...");

    // 1) Ask API for SAS URL
    const sas = await apiPostRaw(`/events/${eventId}/media/sas`, {
      fileName: file.name,
      contentType: file.type,
    });

    // 2) Upload directly to Blob using SAS (no event processing, no server streaming)
    setMsg("Uploading to Blob Storage...");
    const putRes = await fetch(sas.uploadUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error(`Blob upload failed: ${putRes.status}`);
    }

    // 3) Store metadata in Cosmos
    setMsg("Saving metadata...");
    await apiPostRaw(`/events/${eventId}/media`, {
      mediaId: sas.mediaId,
      blobUrl: sas.blobUrl,
      type: file.type.startsWith("video") ? "VIDEO" : "IMAGE",
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });

    setMsg("Done.");
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
