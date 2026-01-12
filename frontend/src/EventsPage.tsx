import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";
import UploadMedia from "./UploadMedia";

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
      <ul>
        {events.map((ev) => (
          <li key={ev.id}>
            <strong>{ev.title}</strong> <span>({ev.eventId})</span>
          </li>
        ))}
      </ul>
      {events[0] && (
        <div
          style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #ddd" }}
        >
          <h3>Upload to first event</h3>

          <div style={{ marginBottom: 8 }}>
            <strong>{events[0].title}</strong>
          </div>

          <UploadMedia eventId={events[0].eventId} />
        </div>
      )}
    </div>
  );
}
