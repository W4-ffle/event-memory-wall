import { useEffect, useState } from "react";
import { apiGet } from "./api";

type MediaDoc = {
  mediaId: string;
  blobUrl: string;
  type: "IMAGE" | "VIDEO";
  fileName: string;
  createdAt: string;
};

type MediaView = MediaDoc & {
  displayUrl: string; // SAS URL for reading
};

export default function MediaGallery({ eventId }: { eventId: string }) {
  const [media, setMedia] = useState<MediaView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) Get metadata from Cosmos (your existing endpoint)
        const items = await apiGet<MediaDoc[]>(`/events/${eventId}/media`);

        // 2) For each item, ask API for a READ SAS url
        const withUrls = await Promise.all(
          items.map(async (m) => {
            // CHANGE THIS if your endpoint differs:
            // Expected response: { downloadUrl: string } OR { url: string }
            const sas = await apiGet<{ downloadUrl?: string; url?: string }>(
              `/events/${eventId}/media/${m.mediaId}/sas`
            );

            const displayUrl = sas.downloadUrl || sas.url;
            if (!displayUrl) {
              throw new Error("SAS response missing downloadUrl/url");
            }

            return { ...m, displayUrl } as MediaView;
          })
        );

        if (!cancelled) setMedia(withUrls);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load media");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) return <div>Loading media…</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!media.length) return <div>No media yet.</div>;

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
              src={m.displayUrl}
              alt={m.fileName}
              style={{ width: "100%", borderRadius: 6 }}
            />
          ) : (
            <video
              src={m.displayUrl}
              controls
              style={{ width: "100%", borderRadius: 6 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
