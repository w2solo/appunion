import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-semibold">
            AppUnions
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/docs">文档</Link>
            {user ? <Link to="/apps">控制台</Link> : <Link to="/login">登录</Link>}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-line bg-white p-4 text-sm">
        <Link to="/" className="mb-6 block font-semibold">
          AppUnions
        </Link>
        <NavLink className={navClass} to="/apps">
          我的应用
        </NavLink>
        <NavLink className={navClass} to="/docs">
          接入文档
        </NavLink>
        {user?.role === "admin" && (
          <>
            <div className="mb-2 mt-6 text-xs uppercase text-muted">运营</div>
            <NavLink className={navClass} to="/ops/review">
              审核
            </NavLink>
            <NavLink className={navClass} to="/ops/anomalies">
              异常
            </NavLink>
            <NavLink className={navClass} to="/ops/config">
              设置
            </NavLink>
            {user.superAdmin && (
              <NavLink className={navClass} to="/ops/admins">
                管理员
              </NavLink>
            )}
          </>
        )}
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-end gap-4 border-b border-line bg-white px-6 py-3 text-sm">
          <Link to="/docs">文档</Link>
          <span className="text-muted">{user?.email}</span>
          <button
            className="text-brand"
            onClick={() => {
              void logout().then(() => {
                window.location.href = "/login";
              });
            }}
          >
            退出
          </button>
        </header>
        <main className="mx-auto max-w-5xl p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `mb-1 block rounded px-2 py-1.5 ${isActive ? "bg-slate-100 font-medium" : "text-slate-700 hover:bg-slate-50"}`;
}
