import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDeleteRaw } from "./api";
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

  // inline delete confirmation state
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

  async function deleteEventConfirmed(ev: EventDoc) {
    setError(null);
    setDeletingEventId(ev.eventId);

    try {
      await apiDeleteRaw(`/events/${ev.eventId}`);
      setConfirmDeleteEventId(null);
      setDeletingEventId(null);
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
          const isConfirming = confirmDeleteEventId === ev.eventId;
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{ev.eventId}</div>
                </div>

                {!isConfirming ? (
                  <button
                    onClick={() => setConfirmDeleteEventId(ev.eventId)}
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
                ) : (
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <span style={{ fontSize: 12, opacity: 0.8 }}>
                      Delete this event and all its media?
                    </span>

                    <button
                      onClick={() => setConfirmDeleteEventId(null)}
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
                      onClick={() => deleteEventConfirmed(ev)}
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
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <UploadMedia
                  eventId={ev.eventId}
                  onUploaded={() => bumpRefresh(ev.eventId)}
                />
              </div>

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
