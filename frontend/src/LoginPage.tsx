import { useMemo, useState } from "react";

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [adminPasscode, setAdminPasscode] = useState("");

  const canContinue = useMemo(() => userId.trim().length > 0, [userId]);

  function save() {
    const u = userId.trim();
    if (!u) return alert("Enter a username");

    localStorage.setItem(
      "emw_session",
      JSON.stringify({
        userId: u,
        // UI hint only; backend will validate passcode
        isAdmin: !!adminPasscode.trim(),
        adminPasscode: adminPasscode.trim() || undefined,
      })
    );

    onDone();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "#fff",
        fontFamily: "system-ui",
        overflow: "auto",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          width: "100%",
          padding: "18px 24px",
          borderBottom: "1px solid #eee",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>Memory Wall</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Sign in</div>
        </div>
      </div>

      {/* Centered content */}
      <div
        style={{
          minHeight: "calc(100vh - 61px)", // subtract topbar height
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            border: "1px solid #eee",
            borderRadius: 14,
            background: "#fff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            padding: 22,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>Welcome</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
            Enter a username to join. Admins can optionally enter the passcode
            to manage events.
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                Username
              </div>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. barry"
                autoComplete="username"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                Admin passcode{" "}
                <span style={{ fontWeight: 600, opacity: 0.6 }}>
                  (optional)
                </span>
              </div>
              <input
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Enter passcode if you have it"
                autoComplete="current-password"
                type="password"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 6,
              }}
            >
              <button
                onClick={save}
                disabled={!canContinue}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#0b0b1a",
                  color: "#fff",
                  cursor: canContinue ? "pointer" : "not-allowed",
                  opacity: canContinue ? 1 : 0.6,
                  fontWeight: 800,
                }}
              >
                Continue
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
              Your username is stored locally in your browser for this demo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
