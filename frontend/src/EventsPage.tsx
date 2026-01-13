import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDeleteRaw, apiPatch } from "./api";
import UploadMedia from "./UploadMedia";
import MediaGallery from "./MediaGallery";

type EventDoc = {
  id: string;
  eventId: string;
  hostId: string;
  title: string;
  description?: string;
  createdAt: string;
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setEditingEventId(ev.eventId);
    setEditTitle(ev.title);

    // if user was confirming delete, close it
    setConfirmDeleteEventId(null);
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditTitle("");
  }

  async function saveEdit(eventId: string) {
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
    setError(null);

    // if editing, close editing
    cancelEdit();

    setConfirmDeleteEventId(ev.eventId);
  }

  function cancelDelete() {
    setConfirmDeleteEventId(null);
  }

  async function confirmDelete(ev: EventDoc) {
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

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}
    >
      <h1>Event Memory Wall</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New event title"
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={create} style={{ padding: "10px 14px" }}>
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
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {ev.eventId}
                      </div>
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

                {/* Right-side controls */}
                {!isEditing && !isConfirmingDelete && (
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

                {/* Edit controls */}
                {isEditing && (
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

              {/* Inline delete confirmation row */}
              {isConfirmingDelete && (
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

              {/* Upload */}
              <div style={{ marginTop: 12 }}>
                <UploadMedia
                  eventId={ev.eventId}
                  onUploaded={() => bumpRefresh(ev.eventId)}
                />
              </div>

              {/* Gallery */}
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
