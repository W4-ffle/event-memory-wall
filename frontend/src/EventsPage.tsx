import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";
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

  // per-event refresh counter (bump after uploads)
  const [mediaRefresh, setMediaRefresh] = useState<Record<string, number>>({});

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
        {events.map((ev) => (
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
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{ev.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{ev.eventId}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <UploadMedia
                eventId={ev.eventId}
                onUploaded={() =>
                  setMediaRefresh((prev) => ({
                    ...prev,
                    [ev.eventId]: (prev[ev.eventId] ?? 0) + 1,
                  }))
                }
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <MediaGallery
                eventId={ev.eventId}
                refreshKey={mediaRefresh[ev.eventId] ?? 0}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
