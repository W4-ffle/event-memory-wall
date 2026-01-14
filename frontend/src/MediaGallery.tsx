import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiDeleteRaw } from "./api";

type MediaDoc = {
  mediaId: string;
  blobUrl: string;
  type: "IMAGE" | "VIDEO"; // backend may be wrong; UI also infers from extension
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

/**
 * Backend is currently mislabelling some videos as IMAGE.
 * Infer from file extension as a robust fallback.
 */
function isVideoFile(fileName?: string) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "mov" || ext === "webm" || ext === "ogv";
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

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Touch/swipe tracking
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const hasMedia = media.length > 0;

  const activeItem = useMemo(() => {
    if (!hasMedia) return null;
    const idx = Math.min(Math.max(activeIndex, 0), media.length - 1);
    return media[idx] ?? null;
  }, [activeIndex, hasMedia, media]);

  function openAt(index: number) {
    if (!media.length) return;
    setActiveIndex(Math.min(Math.max(index, 0), media.length - 1));
    setLightboxOpen(true);
  }

  function closeLightbox() {
    setLightboxOpen(false);
  }

  function next() {
    if (!media.length) return;
    setActiveIndex((i) => (i + 1) % media.length);
  }

  function prev() {
    if (!media.length) return;
    setActiveIndex((i) => (i - 1 + media.length) % media.length);
  }

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

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };

    window.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, media.length]);

  async function onDelete(mediaId: string) {
    setError(null);
    setDeleting(mediaId);

    try {
      await apiDeleteRaw(`/events/${eventId}/media/${mediaId}`);
      onDeleted?.();
      if (lightboxOpen) setLightboxOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Delete failed.");
    } finally {
      setDeleting(null);
    }
  }

  function onBackdropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) closeLightbox();
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    const t = e.changedTouches[0];
    if (!t || startX == null || startY == null) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) < 50) return;
    if (Math.abs(dy) > 80) return;

    if (dx < 0) next();
    else prev();
  }

  if (loading) return <div className="emw-muted">Loading media...</div>;
  if (error) return <div className="emw-errorText">{error}</div>;
  if (!media.length) return <div className="emw-muted">No media yet.</div>;

  return (
    <>
      <div className="emw-mediaGrid">
        {media.map((m, idx) => {
          const treatAsVideo = m.type === "VIDEO" || isVideoFile(m.fileName);

          return (
            <div key={m.mediaId} className="emw-mediaCard">
              <button
                type="button"
                className="emw-mediaThumb emw-mediaThumbBtn"
                onClick={() => openAt(idx)}
                title="View"
              >
                {treatAsVideo ? (
                  <video
                    className="emw-mediaFill"
                    muted
                    playsInline
                    preload="metadata"
                  >
                    <source src={m.displayUrl} />
                  </video>
                ) : (
                  <img
                    src={m.displayUrl}
                    alt={m.fileName || ""}
                    className="emw-mediaFill"
                    loading="lazy"
                  />
                )}
              </button>

              <button
                onClick={() => onDelete(m.mediaId)}
                disabled={deleting === m.mediaId}
                className="emw-btn emw-btn-ghost emw-btn-block"
                data-disabled={deleting === m.mediaId ? "true" : "false"}
              >
                {deleting === m.mediaId ? "Deleting..." : "Delete"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxOpen && activeItem && (
        <div className="emw-lightbox" onMouseDown={onBackdropMouseDown}>
          <div
            className="emw-lightboxInner"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <button
              type="button"
              className="emw-lightboxClose"
              aria-label="Close"
              onMouseDownCapture={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeLightbox();
              }}
              onPointerDownCapture={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeLightbox();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeLightbox();
              }}
            >
              ✕
            </button>

            <button
              className="emw-lightboxNav emw-lightboxPrev"
              onClick={prev}
              aria-label="Previous"
              type="button"
            >
              ‹
            </button>

            <div className="emw-lightboxStage">
              {activeItem.type === "VIDEO" ||
              isVideoFile(activeItem.fileName) ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="emw-lightboxMedia"
                >
                  <source src={activeItem.displayUrl} />
                  Your browser can’t play this video.{" "}
                  <a
                    href={activeItem.displayUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open video
                  </a>
                </video>
              ) : (
                <img
                  src={activeItem.displayUrl}
                  alt={activeItem.fileName || ""}
                  className="emw-lightboxMedia"
                />
              )}
            </div>

            <button
              className="emw-lightboxNav emw-lightboxNext"
              onClick={next}
              aria-label="Next"
              type="button"
            >
              ›
            </button>

            <div className="emw-lightboxCaption">
              <div className="emw-lightboxCaptionName">
                {activeItem.fileName || "Media"}
              </div>
              <div className="emw-lightboxCaptionMeta">
                {activeIndex + 1} / {media.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
