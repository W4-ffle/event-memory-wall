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

  if (loading) return <div className="emw-muted">Loading media...</div>;
  if (error) return <div className="emw-errorText">{error}</div>;
  if (!media.length) return <div className="emw-muted">No media yet.</div>;

  return (
    <div className="emw-mediaGrid">
      {media.map((m) => (
        <div key={m.mediaId} className="emw-mediaCard">
          <div className="emw-mediaThumb">
            {m.type === "IMAGE" ? (
              <img
                src={m.displayUrl}
                alt=""
                className="emw-mediaFill"
                loading="lazy"
              />
            ) : (
              <video src={m.displayUrl} controls className="emw-mediaFill" />
            )}
          </div>

          <button
            onClick={() => onDelete(m.mediaId)}
            disabled={deleting === m.mediaId}
            className="emw-btn emw-btn-ghost emw-btn-block"
            data-disabled={deleting === m.mediaId ? "true" : "false"}
          >
            {deleting === m.mediaId ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
