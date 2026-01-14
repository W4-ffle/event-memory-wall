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
    <div className="emw-members">
      <button
        onClick={() => setOpen((v) => !v)}
        className="emw-btn emw-btn-ghost"
      >
        {open ? "Hide Members" : "Members"}
      </button>

      {open && (
        <div className="emw-membersPanel">
          <div className="emw-membersSummary">
            Members: {members?.length ? members.join(", ") : "None"}
          </div>

          {canManage && (
            <div className="emw-membersAddRow">
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Add member by userId"
                className="emw-input emw-membersAddInput"
                disabled={busy}
              />
              <button
                onClick={add}
                disabled={busy || !newMember.trim()}
                className="emw-btn emw-btn-primary"
                data-disabled={busy || !newMember.trim() ? "true" : "false"}
              >
                Add
              </button>
            </div>
          )}

          <div className="emw-membersList">
            {(members ?? []).map((m) => {
              const isOwner = !!ownerId && m === ownerId;

              return (
                <div key={m} className="emw-membersRow">
                  <div className="emw-membersUser">
                    {m}{" "}
                    {isOwner && (
                      <span className="emw-membersOwner">(owner)</span>
                    )}
                  </div>

                  {canManage && (
                    <button
                      onClick={() => remove(m)}
                      disabled={busy || isOwner}
                      className="emw-btn emw-btn-ghost emw-btn-sm"
                      data-disabled={busy || isOwner ? "true" : "false"}
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

          {msg && <div className="emw-membersMsg">{msg}</div>}
        </div>
      )}
    </div>
  );
}
