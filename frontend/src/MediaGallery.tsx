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

            if (!displayUrl) {
              const keys = Object.keys(sas ?? {}).join(", ");
              throw new Error(
                `SAS response missing read url (mediaId=${m.mediaId}). Keys: ${keys}`
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
  }, [eventId, refreshKey]);

  async function onDelete(mediaId: string) {
    setError(null);
    setDeleting(mediaId);

    try {
      await apiDeleteRaw(`/events/${eventId}/media/${mediaId}`);
      // keep your existing refresh contract
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
            borderRadius: 10,
            padding: 10,
            background: "#fff",
          }}
        >
          <div
            style={{
              width: "100%",
              borderRadius: 10,
              overflow: "hidden",
              background: "#f6f6f6",
              aspectRatio: "1 / 1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {m.type === "IMAGE" ? (
              <img
                src={m.displayUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy"
              />
            ) : (
              <video
                src={m.displayUrl}
                controls
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>

          <button
            onClick={() => onDelete(m.mediaId)}
            disabled={deleting === m.mediaId}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: deleting === m.mediaId ? "not-allowed" : "pointer",
              opacity: deleting === m.mediaId ? 0.7 : 1,
              fontWeight: 600,
            }}
          >
            {deleting === m.mediaId ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
