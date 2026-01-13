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
        fontFamily: "system-ui",
        minHeight: "100vh",
        background: "#fff",
      }}
    >
      {/* Top navigation bar */}
      <div
        style={{
          height: 64,
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800 }}>Memory Wall</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Sign in</div>
      </div>

      {/* Centered login content */}
      <div
        style={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            border: "1px solid #eee",
            borderRadius: 14,
            background: "#fff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>Welcome</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
            Enter a username to join. Admins can optionally enter the passcode
            to manage events.
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                Username
              </div>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. barry"
                autoComplete="username"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  outline: "none",
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                Admin passcode <span style={{ opacity: 0.6 }}>(optional)</span>
              </div>
              <input
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Enter passcode if you have it"
                type="password"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  outline: "none",
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={save}
                disabled={!canContinue}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#0b0b1a",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: canContinue ? "pointer" : "not-allowed",
                  opacity: canContinue ? 1 : 0.6,
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
