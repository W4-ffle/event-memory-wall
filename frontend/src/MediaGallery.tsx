import { useEffect, useState } from "react";
import { apiGet } from "./api";

type MediaDoc = {
  mediaId: string;
  blobUrl: string;
  type: "IMAGE" | "VIDEO";
  fileName: string;
  createdAt: string;
};

export default function MediaGallery({ eventId }: { eventId: string }) {
  const [media, setMedia] = useState<MediaDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<MediaDoc[]>(`/events/${eventId}/media`);
        setMedia(data);
      } catch (e: any) {
        setError(e.message);
      }
    }
    load();
  }, [eventId]);

  if (error) {
    return <div style={{ color: "red" }}>{error}</div>;
  }

  if (!media.length) {
    return <div>No media yet.</div>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 12,
        marginTop: 12,
      }}
    >
      {media.map((m) => (
        <div key={m.mediaId}>
          {m.type === "IMAGE" ? (
            <img
              src={m.blobUrl}
              alt={m.fileName}
              style={{ width: "100%", borderRadius: 6 }}
            />
          ) : (
            <video
              src={m.blobUrl}
              controls
              style={{ width: "100%", borderRadius: 6 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
