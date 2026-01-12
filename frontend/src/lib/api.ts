// frontend/src/lib/api.ts
export type ApiError = { status: number; message: string };

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) throw new Error("VITE_API_BASE_URL is not set");
  return base.replace(/\/+$/, "");
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(opts.headers || {});
  headers.set("Content-Type", "application/json");
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw { status: res.status, message: text || res.statusText } as ApiError;
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return (await res.json()) as T;
}
