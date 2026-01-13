const BASE = import.meta.env.VITE_API_BASE_URL;

type Session = {
  userId: string;
  isAdmin: boolean;
  adminPasscode?: string; // only stored if entered
};

function getSession(): Session | null {
  const raw = localStorage.getItem("emw_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const s = getSession();
  if (!s?.userId) return {}; // allow anonymous until you enforce it server-side
  const h: Record<string, string> = {
    "x-user-id": s.userId,
    "x-admin": String(!!s.isAdmin),
  };
  if (s.adminPasscode) h["x-admin-passcode"] = s.adminPasscode;
  return h;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPostRaw(path: string, body: any): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH ${path} failed: ${res.status} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return undefined as unknown as T;
}

export async function apiDeleteRaw(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE ${path} failed: ${res.status} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}
