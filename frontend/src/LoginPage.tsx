import { useState } from "react";

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [adminPasscode, setAdminPasscode] = useState("");

  function save() {
    const u = userId.trim();
    if (!u) return alert("Enter a username");
    const isAdmin = !!adminPasscode.trim();

    localStorage.setItem(
      "emw_session",
      JSON.stringify({
        userId: u,
        isAdmin,
        adminPasscode: adminPasscode.trim() || undefined,
      })
    );

    onDone();
  }

  return (
    <div
      style={{ maxWidth: 520, margin: "60px auto", fontFamily: "system-ui" }}
    >
      <h1>Event Memory Wall</h1>
      <p style={{ opacity: 0.8 }}>
        Enter a username to join. Admins can enter the passcode to manage
        events.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Username (required)"
          style={{ padding: 10 }}
        />
        <input
          value={adminPasscode}
          onChange={(e) => setAdminPasscode(e.target.value)}
          placeholder="Admin passcode (optional)"
          style={{ padding: 10 }}
        />
        <button onClick={save} style={{ padding: "10px 14px" }}>
          Continue
        </button>
      </div>
    </div>
  );
}
