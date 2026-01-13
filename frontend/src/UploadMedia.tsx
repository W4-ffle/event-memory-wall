import { useState } from "react";
import { apiPost } from "./api";

type SasResponse = {
  uploadUrl: string;
  blobUrl: string;
  blobName: string;
  expiresOn?: string;
  contentType?: string;
  eventId: string;
  hostId: string;
};

export default function UploadMedia({
  eventId,
  onUploaded,
}: {
  eventId: string;
  onUploaded?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function uploadOne(file: File) {
    // 1) Get SAS for this file
    const sas = await apiPost<SasResponse>(`/events/${eventId}/media/sas`, {
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    });

    // 2) Upload to Blob via SAS (PUT)
    const putRes = await fetch(sas.uploadUrl, {
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

    // 3) Save metadata in Cosmos
    await apiPost(`/events/${eventId}/media`, {
      blobUrl: sas.blobUrl,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      type: "IMAGE", // or detect by file.type if you support VIDEO too
    });
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setMsg(null);

    try {
      // sequential upload (easy + stable)
      for (const file of Array.from(files)) {
        await uploadOne(file);
      }

      setMsg(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}.`);
      onUploaded?.();
    } catch (e: any) {
      setMsg(e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Upload media:</div>

      <input
        type="file"
        multiple
        disabled={busy}
        onChange={(e) => {
          void onPickFiles(e.target.files);
          // allow picking the same files again later
          e.currentTarget.value = "";
        }}
      />

      {busy && <div style={{ fontSize: 12, opacity: 0.75 }}>Uploading...</div>}
      {msg && <div style={{ fontSize: 12, opacity: 0.85 }}>{msg}</div>}
    </div>
  );
}
