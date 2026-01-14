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
    <div className="emw-loginShell">
      {/* Top bar */}
      <div className="emw-loginTopbar">
        <div className="emw-loginTopbarInner">
          <div className="emw-brand">Memory Wall</div>
          <div className="emw-loginHint">Sign in</div>
        </div>
      </div>

      {/* Centered content */}
      <div className="emw-loginCenter">
        <div className="emw-loginCard">
          <div className="emw-loginTitle">Welcome</div>
          <div className="emw-loginSubtitle">
            Enter a username to join. Admins can optionally enter the passcode
            to manage events.
          </div>

          <div className="emw-loginForm">
            <div className="emw-field">
              <div className="emw-label">Username</div>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. barry"
                autoComplete="username"
                className="emw-input emw-input-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
              />
            </div>

            <div className="emw-field">
              <div className="emw-label">
                Admin passcode <span className="emw-labelHint">(optional)</span>
              </div>
              <input
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Enter passcode if you have it"
                autoComplete="current-password"
                type="password"
                className="emw-input emw-input-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
              />
            </div>

            <div className="emw-loginActions">
              <button
                onClick={save}
                disabled={!canContinue}
                className="emw-btn emw-btn-primary"
                data-disabled={!canContinue ? "true" : "false"}
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
