import { useEffect, useState } from "react";
import { apiGet } from "./api";

type MediaDoc = {
  mediaId: string;
  blobUrl: string;
  type: "IMAGE" | "VIDEO";
  fileName: string;
  createdAt: string;
};

type MediaWithDisplayUrl = MediaDoc & {
  displayUrl: string;
};

function pickDisplayUrl(sas: any): string | null {
  if (!sas) return null;
  return (
    sas.downloadUrl ||
    sas.url ||
    sas.sasUrl ||
    sas.signedUrl ||
    sas.readUrl ||
    sas.blobUrlWithSas ||
    sas.uploadUrl || // last-resort fallback if your API reused the key name
    null
  );
}

export default function MediaGallery({
  eventId,
  refreshKey,
}: {
  eventId: string;
  refreshKey?: number;
}) {
  const [media, setMedia] = useState<MediaWithDisplayUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) Get metadata list from Cosmos (no blob access required)
        const items = await apiGet<MediaDoc[]>(`/events/${eventId}/media`);

        // 2) For each media item, request a READ-SAS URL from the API
        const resolved: MediaWithDisplayUrl[] = await Promise.all(
          (items ?? []).map(async (m) => {
            // Expected endpoint: /events/{eventId}/media/{mediaId}/sas
            const sas = await apiGet<any>(
              `/events/${eventId}/media/${m.mediaId}/sas`
            );

            const displayUrl = pickDisplayUrl(sas);

            if (!displayUrl) {
              const keys = Object.keys(sas ?? {}).join(", ");
              throw new Error(
                `SAS response missing downloadUrl/url (mediaId=${m.mediaId}). Keys: ${keys}`
              );
            }

            return { ...m, displayUrl };
          })
        );

        if (!cancelled) setMedia(resolved);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load media.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, refreshKey]); // <- refresh after upload

  if (loading) return <div>Loading media...</div>;
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
              loading="lazy"
            />
          ) : (
            <video
              src={m.displayUrl}
              controls
              style={{ width: "100%", borderRadius: 6 }}
            />
          )}
          <div style={{ fontSize: 12, marginTop: 6 }}>{m.fileName}</div>
        </div>
      ))}
    </div>
  );
}
