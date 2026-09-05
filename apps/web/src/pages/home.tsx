export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">应用互推联盟</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
        接入后展示别人的 App，自己也有机会被展示。免费、等权随机，UI 由你自己做。
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <a className="rounded bg-brand px-4 py-2 text-white" href="/login">
          登录 / 注册
        </a>
        <a className="rounded border border-line bg-white px-4 py-2" href="/docs">
          读文档
        </a>
      </div>
    </main>
  );
}
