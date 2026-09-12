export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">应用互推联盟</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
        接入后展示别人的 App，自己也有机会被展示。免费、等权随机，UI 由你自己做。
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <a className="rounded bg-brand px-4 py-2 text-white" href="/login">
          登录
        </a>
        <a className="text-sm text-muted hover:text-slate-800" href="/register">
          没有账号？使用邀请码注册
        </a>
      </div>
    </main>
  );
}
