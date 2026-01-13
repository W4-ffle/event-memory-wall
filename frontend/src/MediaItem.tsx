import { useEffect, useState } from "react";
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

export default function MediaItem({ item }: { item: MediaDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        if (!cancelled) setErr(e.message || "Failed to load media SAS");
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

  if (item.type === "VIDEO") {
    return (
      <div style={{ marginTop: 8 }}>
        <div>{item.fileName}</div>
        <video controls style={{ maxWidth: "100%" }} src={url} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div>{item.fileName}</div>
      <img
        alt={item.fileName}
        src={url}
        style={{ maxWidth: 240, display: "block" }}
      />
    </div>
  );
}
