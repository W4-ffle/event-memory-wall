type ApiErrorBody = { error?: string; message?: string };

const BASE = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";

function apiUrl(path: string) {
  // path is like "/events/.."
  if (!path.startsWith("/")) path = `/${path}`;
  return `${BASE}${path}`;
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

function getSession(): any {
  try {
    return JSON.parse(localStorage.getItem("emw_session") || "null");
  } catch {
    return null;
  }
}

function buildHeaders(extra?: Record<string, string>) {
  const s = getSession();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-host-id": "demo-host",
    ...(extra || {}),
  };

  if (s?.userId) h["x-user-id"] = String(s.userId);
  if (s?.adminPasscode) h["x-admin-passcode"] = String(s.adminPasscode);

  return h;
}

async function parseError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = (await res.json().catch(() => null)) as ApiErrorBody | null;
    return j?.message || j?.error || `HTTP ${res.status}`;
  }
  const t = await res.text().catch(() => "");
  return t || `HTTP ${res.status}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export async function apiPatch(path: string, body?: unknown): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
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

export async function apiGetBlob(path: string): Promise<Blob> {
  // Reuse auth headers, but DO NOT send Content-Type on a GET download
  const headers = buildHeaders({
    Accept: "application/zip, application/octet-stream",
  });
  delete (headers as any)["Content-Type"];

  const res = await fetch(apiUrl(path), {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Download failed (${res.status}): ${text.slice(0, 300) || "No body"}`
    );
  }

  return await res.blob();
}
