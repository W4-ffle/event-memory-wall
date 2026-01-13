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

export default function EventsPage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [title, setTitle] = useState("");
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
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function create() {
    if (!myUserId) {
      setError("You must be signed in to create an event.");
      return;
    }

    setError(null);
    try {
      await apiPost<EventDoc>("/events", { title });
      setTitle("");
      await load();
    } catch (e: any) {
      setError(e.message);
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

    // close delete confirm if open
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

    // if editing, close editing
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
  }, []);

  return (
    <div
      style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h1 style={{ margin: 0 }}>Event Memory Wall</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Create event (signed-in users can create) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={myUserId ? "New event title" : "Sign in to create"}
          style={{ flex: 1, padding: 10 }}
          disabled={!myUserId}
        />
        <button
          onClick={create}
          style={{ padding: "10px 14px" }}
          disabled={!myUserId}
        >
          Create
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, background: "#fee", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <h2>Events</h2>

      <div style={{ display: "grid", gap: 18 }}>
        {events.map((ev) => {
          const isEditing = editingEventId === ev.eventId;
          const isConfirmingDelete = confirmDeleteEventId === ev.eventId;
          const isDeleting = deletingEventId === ev.eventId;

          const membersClean = uniqueStrings(ev.memberIds ?? []);
          const memberLabel =
            membersClean.slice(0, 6).join(", ") || "(none set)";

          const canManage = canManageMembers(ev);

          return (
            <div
              key={ev.id}
              style={{
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  {!isEditing ? (
                    <>
                      <div style={{ fontWeight: 700 }}>{ev.title}</div>

                      {/* Show a compact members line (useful for admin + members) */}
                      {membersClean.length > 0 && (
                        <div
                          style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}
                        >
                          Members: {memberLabel}
                          {membersClean.length > 6 ? " …" : ""}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Edit title
                      </div>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{ width: "100%", padding: 8, marginTop: 6 }}
                      />
                    </>
                  )}
                </div>

                {/* Right-side controls — ADMIN ONLY */}
                {admin && !isEditing && !isConfirmingDelete && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => startEdit(ev)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => requestDelete(ev)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Delete Event
                    </button>
                  </div>
                )}

                {/* Edit controls — ADMIN ONLY */}
                {admin && isEditing && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => saveEdit(ev.eventId)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Members panel — visible if you are admin OR a member (backend enforces too) */}
              {(admin || canManage) && (
                <MembersPanel
                  eventId={ev.eventId}
                  members={membersClean}
                  ownerId={ev.ownerId}
                  canManage={canManage} // member or admin
                  onChanged={(next) => updateEventMembers(ev.eventId, next)}
                />
              )}

              {/* Inline delete confirmation row — ADMIN ONLY */}
              {admin && isConfirmingDelete && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: "1px solid #f2c2c2",
                    background: "#fff7f7",
                    borderRadius: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    Delete <strong>{ev.title}</strong>? This will also delete
                    all media under the event.
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={cancelDelete}
                      disabled={isDeleting}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        opacity: isDeleting ? 0.6 : 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => confirmDelete(ev)}
                      disabled={isDeleting}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        opacity: isDeleting ? 0.6 : 1,
                      }}
                    >
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </button>
                  </div>
                </div>
              )}

              {/* Upload — ALL USERS (backend enforces membership) */}
              <div style={{ marginTop: 12 }}>
                <UploadMedia
                  eventId={ev.eventId}
                  onUploaded={() => bumpRefresh(ev.eventId)}
                />
              </div>

              {/* Gallery — ALL USERS (backend enforces membership for list/read/delete) */}
              <div style={{ marginTop: 12 }}>
                <MediaGallery
                  eventId={ev.eventId}
                  refreshKey={mediaRefresh[ev.eventId] ?? 0}
                  onDeleted={() => bumpRefresh(ev.eventId)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
