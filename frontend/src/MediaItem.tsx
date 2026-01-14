import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api";

type MediaDoc = {
  mediaId: string;
  eventId: string;
  type: "IMAGE" | "VIDEO";
  fileName: string;
};

type ReadSasResponse = {
  readUrl: string;
  expiresOn: string;
};

function guessMime(fileName: string): string | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "ogg":
    case "ogv":
      return "video/ogg";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    default:
      return undefined;
  }
}

export default function MediaItem({ item }: { item: MediaDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mime = useMemo(() => guessMime(item.fileName), [item.fileName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        const sas = await apiGet<ReadSasResponse>(
          `/events/${item.eventId}/media/${item.mediaId}/sas`
        );
        if (!cancelled) setUrl(sas.readUrl);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load media SAS");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [item.eventId, item.mediaId]);

  if (err)
    return (
      <div style={{ color: "crimson" }}>
        {item.fileName}: {err}
      </div>
    );
  if (!url) return <div>Loading {item.fileName}...</div>;

  // Quick sanity: some browsers behave better if you force inline disposition.
  // This does NOT fix wrong Content-Type headers, but it prevents forced downloads.
  const inlineUrl = url.includes("?")
    ? `${url}&rscd=inline`
    : `${url}?rscd=inline`;

  if (item.type === "VIDEO") {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ marginBottom: 6 }}>{item.fileName}</div>

        <video
          controls
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            maxWidth: 520,
            borderRadius: 12,
            display: "block",
          }}
          // Do NOT rely only on src; use <source> so the browser sees the MIME type.
        >
          <source src={inlineUrl} type={mime || "video/mp4"} />
          {/* Fallback */}
          Your browser can’t play this video.{" "}
          <a href={inlineUrl} target="_blank" rel="noreferrer">
            Open video
          </a>
        </video>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 6 }}>{item.fileName}</div>
      <img
        alt={item.fileName}
        src={inlineUrl}
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 12,
          display: "block",
        }}
        loading="lazy"
      />
    </div>
  );
}
