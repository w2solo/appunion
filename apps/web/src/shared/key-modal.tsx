export function KeyModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">请立即保存 API Key</h2>
        <p className="mt-2 text-sm text-red-700">请立即保存，离开后无法再看明文。</p>
        <pre className="mt-4 overflow-x-auto rounded bg-slate-100 p-3 text-sm">{apiKey}</pre>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-brand px-3 py-2 text-sm text-white"
            onClick={() => void navigator.clipboard.writeText(apiKey)}
          >
            复制
          </button>
          <button className="rounded border border-line px-3 py-2 text-sm" onClick={onClose}>
            我已保存
          </button>
        </div>
      </div>
    </div>
  );
}
