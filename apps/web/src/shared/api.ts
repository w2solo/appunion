export type ApiError = { error: { code: string; message: string } };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data as ApiError | null;
    const error = new Error(err?.error?.message ?? "请求失败") as Error & { status: number; code?: string };
    error.status = res.status;
    error.code = err?.error?.code;
    throw error;
  }
  return data as T;
}
