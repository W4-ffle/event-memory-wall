import { useState } from "react";
import { apiPost, apiDeleteRaw } from "./api";

export default function MembersPanel({
  eventId,
  members,
  canManage,
  onChanged,
  ownerId,
}: {
  eventId: string;
  members: string[];
  ownerId?: string;
  canManage: boolean; // member or admin
  onChanged: (nextMembers: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const id = newMember.trim();
    if (!id) return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<{ memberIds: string[] }>(
        `/events/${eventId}/members`,
        { memberId: id }
      );
      onChanged(res.memberIds ?? []);
      setNewMember("");
      setMsg("Member added.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to add member");
    } finally {
      setBusy(false);
    }
  }

  async function remove(memberId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiDeleteRaw(`/events/${eventId}/members/${memberId}`);
      const parsed = typeof res === "string" ? JSON.parse(res) : (res as any);
      onChanged(parsed.memberIds ?? []);
      setMsg("Member removed.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to remove member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        {open ? "Hide Members" : "Members"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Members: {members?.length ? members.join(", ") : "None"}
          </div>

          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Add member by userId"
                style={{ flex: 1, padding: 10 }}
                disabled={busy}
              />
              <button
                onClick={add}
                disabled={busy || !newMember.trim()}
                style={{ padding: "10px 14px" }}
              >
                Add
              </button>
            </div>
          )}

          {/* Optional remove list */}
          <div style={{ display: "grid", gap: 6 }}>
            {(members ?? []).map((m) => {
              const isOwner = !!ownerId && m === ownerId;

              return (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    {m}{" "}
                    {isOwner && (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        (owner)
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <button
                      onClick={() => remove(m)}
                      disabled={busy || isOwner}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                        opacity: isOwner ? 0.5 : 1,
                      }}
                      title={
                        isOwner ? "Owner cannot be removed" : "Remove member"
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {msg && <div style={{ fontSize: 12, opacity: 0.8 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
