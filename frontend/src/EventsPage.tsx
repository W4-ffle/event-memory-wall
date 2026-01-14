import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDeleteRaw, apiPatch, apiGetBlob } from "./api";
import UploadMedia from "./UploadMedia";
import MediaGallery from "./MediaGallery";
import MembersPanel from "./MembersPanel";
import { toggleTheme, getTheme } from "./theme";

type EventDoc = {
  id: string;
  eventId: string;
  hostId: string;
  title: string;
  description?: string;
  createdAt: string;

  ownerId?: string;
  memberIds?: string[];
  status?: string;
};

type MediaDoc = {
  mediaId: string;
  type: "IMAGE" | "VIDEO";
  createdAt: string;
  fileName: string;
};

function getSession(): { userId?: string; isAdmin?: boolean } | null {
  try {
    return JSON.parse(localStorage.getItem("emw_session") || "null");
  } catch {
    return null;
  }
}

function isAdmin(): boolean {
  const s = getSession();
  return !!s?.isAdmin;
}

function uniqueStrings(xs: any[]): string[] {
  return Array.from(
    new Set(
      (xs ?? [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

function safeFileName(name: string) {
  const base = String(name || "event")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return base.length ? base : "event";
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  const admin = isAdmin();
  const session = getSession();

  const [theme, setTheme] = useState(getTheme());

  const myUserId = useMemo(
    () => String(session?.userId || "").trim(),
    [session?.userId]
  );

  const [mediaRefresh, setMediaRefresh] = useState<Record<string, number>>({});

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<
    string | null
  >(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [cardMeta, setCardMeta] = useState<
    Record<
      string,
      {
        coverUrl?: string;
        mediaCount: number;
        contributorCount: number;
      }
    >
  >({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [downloadingEventId, setDownloadingEventId] = useState<string | null>(
    null
  );

  function bumpRefresh(eventId: string) {
    setMediaRefresh((prev) => ({
      ...prev,
      [eventId]: (prev[eventId] ?? 0) + 1,
    }));
  }

  function updateEventMembers(eventId: string, nextMembers: string[]) {
    const cleaned = uniqueStrings(nextMembers);
    setEvents((prev) =>
      prev.map((e) =>
        e.eventId === eventId ? { ...e, memberIds: cleaned } : e
      )
    );

    setCardMeta((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] ?? { mediaCount: 0, contributorCount: 0 }),
        contributorCount: cleaned.length,
      },
    }));
  }

  function canManageMembers(ev: EventDoc): boolean {
    if (!myUserId) return false;
    if (admin) return true;

    const members = uniqueStrings(ev.memberIds ?? []);
    return members.includes(myUserId);
  }

  async function load() {
    setError(null);
    try {
      const data = await apiGet<EventDoc[]>("/events");
      setEvents(data);

      // If the previously selected event no longer exists, clear selection.
      setSelectedEventId((prev) => {
        if (!prev) return null;
        const stillExists = (data ?? []).some((e) => e.eventId === prev);
        return stillExists ? prev : null;
      });

      const baseMeta: Record<
        string,
        { coverUrl?: string; mediaCount: number; contributorCount: number }
      > = {};
      for (const ev of data ?? []) {
        baseMeta[ev.eventId] = {
          coverUrl: undefined,
          mediaCount: 0,
          contributorCount: uniqueStrings(ev.memberIds ?? []).length,
        };
      }
      setCardMeta(baseMeta);

      await Promise.all(
        (data ?? []).map(async (ev) => {
          try {
            const items = await apiGet<MediaDoc[]>(
              `/events/${ev.eventId}/media`
            );
            const mediaCount = (items ?? []).length;

            let coverUrl: string | undefined;
            const first = (items ?? [])[0];
            if (first) {
              const sas = await apiGet<any>(
                `/events/${ev.eventId}/media/${first.mediaId}/sas`
              );
              const url = pickDisplayUrl(sas);
              if (url) coverUrl = url;
            }

            setCardMeta((prev) => ({
              ...prev,
              [ev.eventId]: {
                ...(prev[ev.eventId] ?? { mediaCount: 0, contributorCount: 0 }),
                mediaCount,
                coverUrl,
              },
            }));
          } catch {
            // ignore meta failures
          }
        })
      );

      // IMPORTANT: no auto-selection of the first event anymore.
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createEvent() {
    if (!myUserId) {
      setError("You must be signed in to create an event.");
      return;
    }

    const t = createTitle.trim();
    if (!t) return;

    setError(null);
    setCreating(true);

    try {
      const created = await apiPost<EventDoc>("/events", { title: t });
      setCreateTitle("");
      setCreateOpen(false);
      await load();

      // Optional: after creation, select the newly created event (good UX).
      if (created?.eventId) setSelectedEventId(created.eventId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function downloadEventZip(ev: EventDoc) {
    setError(null);
    setDownloadingEventId(ev.eventId);

    try {
      const blob = await apiGetBlob(`events/${ev.eventId}/download`);
      const fileName = `${safeFileName(ev.title)}.zip`;

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 30_000);
    } catch (e: any) {
      setError(e?.message ?? "Download failed.");
    } finally {
      setDownloadingEventId(null);
    }
  }

  function startEdit(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot edit events.");
      return;
    }

    setError(null);
    setEditingEventId(ev.eventId);
    setEditTitle(ev.title);
    setConfirmDeleteEventId(null);
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditTitle("");
  }

  async function saveEdit(eventId: string) {
    if (!admin) {
      setError("Admin only: you cannot edit events.");
      return;
    }

    setError(null);

    if (!editTitle.trim()) {
      setError("Title cannot be empty");
      return;
    }

    try {
      await apiPatch(`/events/${eventId}`, { title: editTitle.trim() });
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function requestDelete(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot delete events.");
      return;
    }
    setError(null);
    cancelEdit();
    setConfirmDeleteEventId(ev.eventId);
  }

  function cancelDelete() {
    setConfirmDeleteEventId(null);
  }

  async function confirmDelete(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot delete events.");
      return;
    }

    setError(null);
    setDeletingEventId(ev.eventId);

    try {
      await apiDeleteRaw(`/events/${ev.eventId}`);
      setDeletingEventId(null);
      setConfirmDeleteEventId(null);

      if (selectedEventId === ev.eventId) setSelectedEventId(null);

      await load();
    } catch (e: any) {
      setDeletingEventId(null);
      setError(e.message);
    }
  }

  function logout() {
    localStorage.removeItem("emw_session");
    window.location.reload();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.eventId === selectedEventId) || null,
    [events, selectedEventId]
  );

  const navbarHeight = 64;

  return (
    <div className="emw-shell">
      {/* Fixed top navbar */}
      <div className="emw-navbar" style={{ height: navbarHeight }}>
        <div className="emw-navbar-inner">
          <div className="emw-brand">Memory Wall</div>

          <div className="emw-navbar-actions">
            <div className="emw-session">
              {session?.userId ? (
                <>
                  Signed in as <strong>{session.userId}</strong>{" "}
                  <span className="emw-session-role">
                    ({admin ? "admin" : "user"})
                  </span>
                </>
              ) : (
                <>Not signed in</>
              )}
            </div>

            <button onClick={logout} className="emw-btn">
              Log out
            </button>

            <button
              onClick={() => {
                setError(null);
                if (!myUserId) {
                  setError("You must be signed in to create an event.");
                  return;
                }
                setCreateOpen(true);
              }}
              className="emw-btn emw-btn-primary"
            >
              <span className="emw-btn-plus">+</span>
              Create Event
            </button>

            <button
              onClick={() => setTheme(toggleTheme())}
              className="emw-btn"
              title="Toggle dark mode"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="emw-main" style={{ paddingTop: navbarHeight }}>
        <div className="emw-page">
          <div className="emw-page-head">
            <div className="emw-h1">Your Events</div>
            <div className="emw-subtitle">
              Browse and share photos from your memorable events
            </div>
          </div>

          {error && <div className="emw-error">{error}</div>}

          {/* Cards grid */}
          <div className="emw-grid">
            {events.map((ev) => {
              const meta = cardMeta[ev.eventId];
              const cover = meta?.coverUrl;
              const mediaCount = meta?.mediaCount ?? 0;
              const contributorCount =
                meta?.contributorCount ??
                uniqueStrings(ev.memberIds ?? []).length;
              const dateLabel = formatDate(ev.createdAt);
              const isSelected = selectedEventId === ev.eventId;

              return (
                <button
                  key={ev.id}
                  onClick={() =>
                    setSelectedEventId((prev) =>
                      prev === ev.eventId ? null : ev.eventId
                    )
                  }
                  className={`emw-card ${isSelected ? "is-selected" : ""}`}
                >
                  <div className="emw-card-media">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="emw-card-img"
                        loading="lazy"
                      />
                    ) : (
                      <div className="emw-card-empty">No cover yet</div>
                    )}

                    <div className="emw-card-gradient">
                      <div className="emw-card-title">{ev.title}</div>
                      <div className="emw-card-date">{dateLabel}</div>
                    </div>
                  </div>

                  <div className="emw-card-meta">
                    <div className="emw-card-stat">{mediaCount} photos</div>
                    <div className="emw-card-stat">
                      {contributorCount} contributors
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* No selection state */}
          {!selectedEvent && (
            <div className="emw-muted" style={{ marginTop: 16 }}>
              No event selected. Click an event card to view its media.
            </div>
          )}

          {/* Selected event details */}
          {selectedEvent && (
            <div className="emw-detail-wrap">
              <div className="emw-detail">
                <div className="emw-detail-head">
                  <div className="emw-detail-titleArea">
                    {editingEventId !== selectedEvent.eventId ? (
                      <div className="emw-detail-title">
                        {selectedEvent.title}
                      </div>
                    ) : (
                      <>
                        <div className="emw-detail-label">Edit title</div>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="emw-input"
                        />
                      </>
                    )}
                  </div>

                  {(() => {
                    const canManage = canManageMembers(selectedEvent);
                    const canDownload = admin || canManage;

                    return (
                      <div className="emw-detail-actions">
                        {canDownload && (
                          <button
                            onClick={() => downloadEventZip(selectedEvent)}
                            disabled={
                              downloadingEventId === selectedEvent.eventId
                            }
                            className="emw-btn"
                            title="Download all media as a ZIP"
                            data-disabled={
                              downloadingEventId === selectedEvent.eventId
                                ? "true"
                                : "false"
                            }
                          >
                            {downloadingEventId === selectedEvent.eventId
                              ? "Preparing..."
                              : "Download ZIP"}
                          </button>
                        )}

                        {admin &&
                          editingEventId !== selectedEvent.eventId &&
                          confirmDeleteEventId !== selectedEvent.eventId && (
                            <>
                              <button
                                onClick={() => startEdit(selectedEvent)}
                                className="emw-btn"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => requestDelete(selectedEvent)}
                                className="emw-btn"
                              >
                                Delete Event
                              </button>
                            </>
                          )}

                        {admin && editingEventId === selectedEvent.eventId && (
                          <>
                            <button
                              onClick={() => saveEdit(selectedEvent.eventId)}
                              className="emw-btn"
                            >
                              Save
                            </button>
                            <button onClick={cancelEdit} className="emw-btn">
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {(() => {
                  const membersClean = uniqueStrings(
                    selectedEvent.memberIds ?? []
                  );
                  const canManage = canManageMembers(selectedEvent);
                  return admin || canManage ? (
                    <MembersPanel
                      eventId={selectedEvent.eventId}
                      members={membersClean}
                      ownerId={selectedEvent.ownerId}
                      canManage={canManage}
                      onChanged={(next) =>
                        updateEventMembers(selectedEvent.eventId, next)
                      }
                    />
                  ) : null;
                })()}

                {admin && confirmDeleteEventId === selectedEvent.eventId && (
                  <div className="emw-confirm">
                    <div className="emw-confirm-text">
                      Delete <strong>{selectedEvent.title}</strong>? This will
                      also delete all media under the event.
                    </div>

                    <div className="emw-confirm-actions">
                      <button
                        onClick={cancelDelete}
                        disabled={deletingEventId === selectedEvent.eventId}
                        className="emw-btn"
                        data-disabled={
                          deletingEventId === selectedEvent.eventId
                            ? "true"
                            : "false"
                        }
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDelete(selectedEvent)}
                        disabled={deletingEventId === selectedEvent.eventId}
                        className="emw-btn"
                        data-disabled={
                          deletingEventId === selectedEvent.eventId
                            ? "true"
                            : "false"
                        }
                      >
                        {deletingEventId === selectedEvent.eventId
                          ? "Deleting..."
                          : "Confirm delete"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="emw-section">
                  <UploadMedia
                    eventId={selectedEvent.eventId}
                    onUploaded={() => bumpRefresh(selectedEvent.eventId)}
                  />
                </div>

                <div className="emw-section emw-section-tight">
                  <MediaGallery
                    eventId={selectedEvent.eventId}
                    refreshKey={mediaRefresh[selectedEvent.eventId] ?? 0}
                    onDeleted={() => bumpRefresh(selectedEvent.eventId)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Event modal */}
      {createOpen && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
          className="emw-modalOverlay"
        >
          <div className="emw-modal">
            <div className="emw-modalHead">
              <div className="emw-modalTitle">Create event</div>
              <button onClick={() => setCreateOpen(false)} className="emw-btn">
                Close
              </button>
            </div>

            <div className="emw-modalText">
              Enter an event title. You can add photos and invite members after
              creating it.
            </div>

            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              className="emw-input emw-input-lg"
              onKeyDown={(e) => {
                if (e.key === "Enter") createEvent();
                if (e.key === "Escape") setCreateOpen(false);
              }}
            />

            <div className="emw-modalActions">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="emw-btn"
                data-disabled={creating ? "true" : "false"}
              >
                Cancel
              </button>

              <button
                onClick={createEvent}
                disabled={creating || !createTitle.trim() || !myUserId}
                className="emw-btn emw-btn-primary"
                data-disabled={
                  creating || !createTitle.trim() || !myUserId
                    ? "true"
                    : "false"
                }
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
