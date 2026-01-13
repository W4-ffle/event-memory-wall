// frontend/src/api.ts
const BASE = import.meta.env.VITE_API_BASE_URL;

type Session = {
  userId: string;
  isAdmin: boolean;
  adminPasscode?: string;
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

  // Always include host id (your backend relies on it)
  const h: Record<string, string> = {
    "x-host-id": "demo-host",
  };

  if (!s?.userId) return h;

  h["x-user-id"] = s.userId;
  if (s.adminPasscode) h["x-admin-passcode"] = s.adminPasscode;

  return h;
}

async function readError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(text);
      const msg = j?.message || j?.error || text;
      return typeof msg === "string" ? msg : text;
    } catch {
      return text;
    }
  }
  return text;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(`GET ${path} failed: ${res.status} ${detail}`.trim());
  }
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

  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(`POST ${path} failed: ${res.status} ${detail}`.trim());
  }
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

  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(`POST ${path} failed: ${res.status} ${detail}`.trim());
  }
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
    const detail = await readError(res);
    throw new Error(`PATCH ${path} failed: ${res.status} ${detail}`.trim());
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
    const detail = await readError(res);
    throw new Error(`DELETE ${path} failed: ${res.status} ${detail}`.trim());
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function apiPostRawNoBody(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function sessionHeaders(): Record<string, string> {
  let s: any = null;
  try {
    s = JSON.parse(localStorage.getItem("emw_session") || "null");
  } catch {}

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-host-id": "demo-host",
  };

  if (s?.userId) headers["x-user-id"] = String(s.userId);
  if (s?.adminPasscode) headers["x-admin-passcode"] = String(s.adminPasscode);

  return headers;
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    method: "GET",
    headers: sessionHeaders(),
  });

  if (!res.ok) {
    // try to parse error json/text
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  return await res.blob();
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function assertLooksLikeZip(blob: Blob) {
  const buf = await blob.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!isZip) {
    const text = await blob.text().catch(() => "");
    throw new Error(
      `Download did not look like a ZIP. First bytes: ${Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}. Body starts: ${text.slice(0, 200)}`
    );
  }
}
