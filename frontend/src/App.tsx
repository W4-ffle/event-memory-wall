import { useEffect, useState } from "react";
import { apiFetch } from "./lib/api";

type Health = { ok: boolean; service: string; time: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    apiFetch<Health>("/health")
      .then(setHealth)
      .catch((e) => setErr(`${e.status ?? ""} ${e.message ?? e}`));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Event Memory Wall</h1>
      <p>Frontend is running.</p>

      <h2>API health</h2>
      {!health && !err && <p>Checking…</p>}
      {err && <pre>{err}</pre>}
      {health && (
        <pre>{JSON.stringify(health, null, 2)}</pre>
      )}
    </div>
  );
}
