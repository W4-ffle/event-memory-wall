import { useEffect, useState } from "react";
import { apiGet, apiDeleteRaw } from "./api";

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
    null
  );
}

export default function MediaGallery({
  eventId,
  refreshKey,
  onDeleted,
}: {
  eventId: string;
  refreshKey?: number;
  onDeleted?: () => void;
}) {
  const [media, setMedia] = useState<MediaWithDisplayUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const items = await apiGet<MediaDoc[]>(`/events/${eventId}/media`);

        const resolved: MediaWithDisplayUrl[] = await Promise.all(
          (items ?? []).map(async (m) => {
            const sas = await apiGet<any>(
              `/events/${eventId}/media/${m.mediaId}/sas`
            );

            const displayUrl = pickDisplayUrl(sas);
            if (!displayUrl) throw new Error("Invalid SAS response");

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
  }, [eventId, refreshKey]);

  async function onDelete(mediaId: string) {
    setError(null);
    setDeleting(mediaId);

    try {
      await apiDeleteRaw(`/events/${eventId}/media/${mediaId}`);
      onDeleted?.();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed.");
    } finally {
      setDeleting(null);
    }
  }

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
        <div
          key={m.mediaId}
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 8,
            background: "#fff",
          }}
        >
          {m.type === "IMAGE" ? (
            <img
              src={m.displayUrl}
              alt=""
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

          <button
            onClick={() => onDelete(m.mediaId)}
            disabled={deleting === m.mediaId}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: deleting === m.mediaId ? "not-allowed" : "pointer",
            }}
          >
            {deleting === m.mediaId ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
