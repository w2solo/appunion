import { useState } from "react";

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error("复制失败，请手动选择复制");
  }
}

export function ActionStatus({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (message) return <p className="text-sm text-green-700">{message}</p>;
  return null;
}

export function useActionFeedback() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return { error, message, busy, run };
}
