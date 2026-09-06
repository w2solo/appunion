export type ApiError = { error: { code: string; message: string } };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new Error("网络请求失败。请用 https:// 打开站点，刷新后再试");
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? "服务器返回了无法解析的内容" : `请求失败（${res.status}）`);
    }
  }
  if (!res.ok) {
    const err = data as ApiError | null;
    const error = new Error(err?.error?.message ?? "请求失败") as Error & { status: number; code?: string };
    error.status = res.status;
    error.code = err?.error?.code;
    throw error;
  }
  return data as T;
}
