import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDeleteRaw, apiPatch } from "./api";
import UploadMedia from "./UploadMedia";
import MediaGallery from "./MediaGallery";
import MembersPanel from "./MembersPanel";

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

export default function EventsPage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  const admin = isAdmin();
  const session = getSession();

  const myUserId = useMemo(
    () => String(session?.userId || "").trim(),
    [session?.userId]
  );

  // per-event refresh counter (bump after uploads/deletes)
  const [mediaRefresh, setMediaRefresh] = useState<Record<string, number>>({});

  // ---------- Edit state ----------
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // ---------- Inline delete confirmation state ----------
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<
    string | null
  >(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // ---------- “Details panel” selection ----------
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ---------- Card metadata (cover + counts) ----------
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

  // ---------- Create modal ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);

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

      // init meta
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

      // best-effort cover/count for each event
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

      // auto-select first event if none selected
      if (!selectedEventId && (data ?? []).length > 0) {
        setSelectedEventId((data ?? [])[0].eventId);
      }
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

      // best-effort select the newly created event
      if (created?.eventId) setSelectedEventId(created.eventId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
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

  // --------- Delete event ----------
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
    <div
      style={{
        // FULL VIEWPORT (prevents parent wrappers from constraining width/height)
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "auto",

        fontFamily: "system-ui",
        background: "#f7f7f8", // subtle off-white
        color: "#111827",
      }}
    >
      {/* Fixed top navbar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: navbarHeight,
          borderBottom: "1px solid #e5e7eb",
          background: "#f7f7f8",
          zIndex: 50,
        }}
      >
        <div
          style={{
            height: "100%",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>Memory Wall</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {session?.userId ? (
                <>
                  Signed in as <strong>{session.userId}</strong>{" "}
                  <span style={{ opacity: 0.75 }}>
                    ({admin ? "admin" : "user"})
                  </span>
                </>
              ) : (
                <>Not signed in</>
              )}
            </div>

            <button
              onClick={logout}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
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
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#0b0b1a",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Create Event
            </button>
          </div>
        </div>
      </div>

      {/* Main content uses full screen width */}
      <div style={{ paddingTop: navbarHeight }}>
        <div style={{ padding: "24px", boxSizing: "border-box" }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Your Events</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              Browse and share photos from your memorable events
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: 12,
                background: "#fee",
                marginBottom: 14,
                borderRadius: 10,
                border: "1px solid #f5caca",
                maxWidth: 900,
              }}
            >
              {error}
            </div>
          )}

          {/* Cards grid (full width) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 18,
              width: "100%",
            }}
          >
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
                  onClick={() => setSelectedEventId(ev.eventId)}
                  style={{
                    textAlign: "left",
                    border: isSelected ? "2px solid #111" : "1px solid #e5e7eb",
                    background: "#fff",
                    borderRadius: 14,
                    overflow: "hidden",
                    padding: 0,
                    cursor: "pointer",
                    boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      height: 190,
                      background: "#f3f3f3",
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#888",
                          fontSize: 13,
                        }}
                      >
                        No cover yet
                      </div>
                    )}

                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: 12,
                        background:
                          "linear-gradient(transparent, rgba(0,0,0,0.65))",
                        color: "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                        {dateLabel}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: 12,
                      fontSize: 13,
                      color: "#333",
                    }}
                  >
                    <div style={{ opacity: 0.85 }}>{mediaCount} photos</div>
                    <div style={{ opacity: 0.85 }}>
                      {contributorCount} contributors
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected event details panel (keeps your existing functionality) */}
          {selectedEvent && (
            <div style={{ marginTop: 26, maxWidth: 1100 }}>
              <div
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {editingEventId !== selectedEvent.eventId ? (
                      <div style={{ fontWeight: 800, fontSize: 18 }}>
                        {selectedEvent.title}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Edit title
                        </div>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          style={{
                            width: "100%",
                            padding: 10,
                            marginTop: 8,
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            outline: "none",
                          }}
                        />
                      </>
                    )}
                  </div>

                  {admin &&
                    editingEventId !== selectedEvent.eventId &&
                    confirmDeleteEventId !== selectedEvent.eventId && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => startEdit(selectedEvent)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => requestDelete(selectedEvent)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Delete Event
                        </button>
                      </div>
                    )}

                  {admin && editingEventId === selectedEvent.eventId && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => saveEdit(selectedEvent.eventId)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: "1px solid #f2c2c2",
                      background: "#fff7f7",
                      borderRadius: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      Delete <strong>{selectedEvent.title}</strong>? This will
                      also delete all media under the event.
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={cancelDelete}
                        disabled={deletingEventId === selectedEvent.eventId}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          cursor:
                            deletingEventId === selectedEvent.eventId
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            deletingEventId === selectedEvent.eventId ? 0.6 : 1,
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDelete(selectedEvent)}
                        disabled={deletingEventId === selectedEvent.eventId}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          cursor:
                            deletingEventId === selectedEvent.eventId
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            deletingEventId === selectedEvent.eventId ? 0.6 : 1,
                          fontWeight: 600,
                        }}
                      >
                        {deletingEventId === selectedEvent.eventId
                          ? "Deleting..."
                          : "Confirm delete"}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <UploadMedia
                    eventId={selectedEvent.eventId}
                    onUploaded={() => bumpRefresh(selectedEvent.eventId)}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
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

      {/* Create Event modal overlay */}
      {createOpen && (
        <div
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #eee",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>Create event</div>
              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
              Enter an event title. You can add photos and invite members after
              creating it.
            </div>

            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid #d1d5db",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") createEvent();
                if (e.key === "Escape") setCreateOpen(false);
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 14,
              }}
            >
              <button
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.7 : 1,
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>

              <button
                onClick={createEvent}
                disabled={creating || !createTitle.trim() || !myUserId}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#0b0b1a",
                  color: "#fff",
                  cursor:
                    creating || !createTitle.trim() || !myUserId
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    creating || !createTitle.trim() || !myUserId ? 0.6 : 1,
                  fontWeight: 700,
                }}
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
