import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDeleteRaw, apiPatch } from "./api";
import UploadMedia from "./UploadMedia";
import MediaGallery from "./MediaGallery";

type EventDoc = {
  id: string;
  eventId: string;
  hostId: string;
  title: string;
  description?: string;
  createdAt: string;

  // ✅ membership fields (may be absent on older docs)
  ownerId?: string;
  memberIds?: string[];
};

function getSession(): { userId?: string; isAdmin?: boolean } | null {
  try {
    return JSON.parse(localStorage.getItem("emw_session") || "null");
  } catch {
    return null;
  }
}

function isAdmin(): boolean {
  const s = getSession();
  return !!s?.isAdmin;
}

function uniqueStrings(xs: any[]): string[] {
  return Array.from(
    new Set(
      (xs ?? [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function parseMemberInput(s: string): string[] {
  // allow comma/space/newline separated
  const tokens = s
    .split(/[\n, ]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return uniqueStrings(tokens);
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const admin = isAdmin();
  const session = getSession();

  // per-event refresh counter (bump after uploads/deletes)
  const [mediaRefresh, setMediaRefresh] = useState<Record<string, number>>({});

  // ---------- Edit state ----------
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // ---------- Membership UI state (admin only) ----------
  const [editingMembersEventId, setEditingMembersEventId] = useState<
    string | null
  >(null);
  const [membersInput, setMembersInput] = useState("");
  const [savingMembersEventId, setSavingMembersEventId] = useState<
    string | null
  >(null);

  // ---------- Inline delete confirmation state ----------
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<
    string | null
  >(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const myUserId = useMemo(() => session?.userId || "", [session?.userId]);

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
    if (!session?.userId) {
      setError("You must be signed in to create an event.");
      return;
    }

    setError(null);
    try {
      await apiPost<EventDoc>("/events", { title });
      setTitle("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function startEdit(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot edit events.");
      return;
    }

    setError(null);
    setEditingEventId(ev.eventId);
    setEditTitle(ev.title);

    // close other panels
    setConfirmDeleteEventId(null);
    setEditingMembersEventId(null);
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditTitle("");
  }

  async function saveEdit(eventId: string) {
    if (!admin) {
      setError("Admin only: you cannot edit events.");
      return;
    }

    setError(null);

    if (!editTitle.trim()) {
      setError("Title cannot be empty");
      return;
    }

    try {
      await apiPatch(`/events/${eventId}`, { title: editTitle.trim() });
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // --------- Members UI ----------
  function startEditMembers(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot edit members.");
      return;
    }
    setError(null);

    // close other panels
    cancelEdit();
    setConfirmDeleteEventId(null);

    setEditingMembersEventId(ev.eventId);

    const currentMembers = uniqueStrings(ev.memberIds ?? []);
    // show as comma separated
    setMembersInput(currentMembers.join(", "));
  }

  function cancelEditMembers() {
    setEditingMembersEventId(null);
    setMembersInput("");
  }

  async function saveMembers(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot edit members.");
      return;
    }

    setError(null);
    setSavingMembersEventId(ev.eventId);

    try {
      const next = parseMemberInput(membersInput);

      // Ensure owner/admin is included server-side too, but we keep UX helpful:
      // include current ownerId if present; include current admin userId if missing
      const merged = uniqueStrings([
        ...(ev.ownerId ? [ev.ownerId] : []),
        ...(myUserId ? [myUserId] : []),
        ...next,
      ]);

      await apiPatch(`/events/${ev.eventId}`, { memberIds: merged });

      setSavingMembersEventId(null);
      cancelEditMembers();
      await load();
    } catch (e: any) {
      setSavingMembersEventId(null);
      setError(e.message);
    }
  }

  // --------- Delete event ----------
  function requestDelete(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot delete events.");
      return;
    }

    setError(null);
    cancelEdit();
    setEditingMembersEventId(null);

    setConfirmDeleteEventId(ev.eventId);
  }

  function cancelDelete() {
    setConfirmDeleteEventId(null);
  }

  async function confirmDelete(ev: EventDoc) {
    if (!admin) {
      setError("Admin only: you cannot delete events.");
      return;
    }

    setError(null);
    setDeletingEventId(ev.eventId);

    try {
      await apiDeleteRaw(`/events/${ev.eventId}`);
      setDeletingEventId(null);
      setConfirmDeleteEventId(null);
      await load();
    } catch (e: any) {
      setDeletingEventId(null);
      setError(e.message);
    }
  }

  function logout() {
    localStorage.removeItem("emw_session");
    window.location.reload();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h1 style={{ margin: 0 }}>Event Memory Wall</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {session?.userId ? (
              <>
                Signed in as <strong>{session.userId}</strong>{" "}
                <span style={{ opacity: 0.75 }}>
                  ({admin ? "admin" : "user"})
                </span>
              </>
            ) : (
              <>Not signed in</>
            )}
          </div>

          <button
            onClick={logout}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Admin-only create UI */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            session?.userId ? "New event title" : "Sign in to create"
          }
          style={{ flex: 1, padding: 10 }}
          disabled={!session?.userId}
        />
        <button
          onClick={create}
          style={{ padding: "10px 14px" }}
          disabled={!session?.userId}
        >
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
          const isEditing = editingEventId === ev.eventId;
          const isConfirmingDelete = confirmDeleteEventId === ev.eventId;
          const isDeleting = deletingEventId === ev.eventId;

          const isEditingMembers = editingMembersEventId === ev.eventId;
          const isSavingMembers = savingMembersEventId === ev.eventId;

          const memberLabel =
            uniqueStrings(ev.memberIds ?? [])
              .slice(0, 6)
              .join(", ") || "(none set)";

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
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  {!isEditing ? (
                    <>
                      <div style={{ fontWeight: 700 }}>{ev.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {ev.eventId}
                      </div>
                      {admin && (
                        <div
                          style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}
                        >
                          Members: {memberLabel}
                          {uniqueStrings(ev.memberIds ?? []).length > 6
                            ? " …"
                            : ""}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Edit title
                      </div>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{ width: "100%", padding: 8, marginTop: 6 }}
                      />
                    </>
                  )}
                </div>

                {/* Right-side controls — ADMIN ONLY */}
                {admin &&
                  !isEditing &&
                  !isConfirmingDelete &&
                  !isEditingMembers && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => startEditMembers(ev)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Members
                      </button>

                      <button
                        onClick={() => startEdit(ev)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => requestDelete(ev)}
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
                    </div>
                  )}

                {/* Edit controls — ADMIN ONLY */}
                {admin && isEditing && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => saveEdit(ev.eventId)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Members editor — ADMIN ONLY */}
              {admin && isEditingMembers && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: "1px solid #eee",
                    background: "#fafafa",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    Edit members for <strong>{ev.title}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      Enter usernames separated by comma, space, or newline.
                      Members can upload/view/delete media. Only admins can
                      edit/delete events.
                    </div>
                  </div>

                  <textarea
                    value={membersInput}
                    onChange={(e) => setMembersInput(e.target.value)}
                    rows={3}
                    style={{ width: "100%", padding: 10, borderRadius: 8 }}
                    placeholder="e.g. alice, bob, charlie"
                  />

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={cancelEditMembers}
                      disabled={isSavingMembers}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: isSavingMembers ? "not-allowed" : "pointer",
                        opacity: isSavingMembers ? 0.6 : 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveMembers(ev)}
                      disabled={isSavingMembers}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: isSavingMembers ? "not-allowed" : "pointer",
                        opacity: isSavingMembers ? 0.6 : 1,
                      }}
                    >
                      {isSavingMembers ? "Saving..." : "Save members"}
                    </button>
                  </div>
                </div>
              )}

              {/* Inline delete confirmation row — ADMIN ONLY */}
              {admin && isConfirmingDelete && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: "1px solid #f2c2c2",
                    background: "#fff7f7",
                    borderRadius: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    Delete <strong>{ev.title}</strong>? This will also delete
                    all media under the event.
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={cancelDelete}
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
                      onClick={() => confirmDelete(ev)}
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
                </div>
              )}

              {/* Upload — ALL USERS (but backend will enforce membership now) */}
              <div style={{ marginTop: 12 }}>
                <UploadMedia
                  eventId={ev.eventId}
                  onUploaded={() => bumpRefresh(ev.eventId)}
                />
              </div>

              {/* Gallery — ALL USERS (but backend enforces membership for read SAS, list, delete) */}
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
