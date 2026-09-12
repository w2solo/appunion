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
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-white p-4 text-sm">
        <Link to="/" className="mb-6 block font-semibold">
          AppUnions
        </Link>
        <NavLink className={navClass} to="/apps">
          我的应用
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
            <NavLink className={navClass} to="/ops/categories">
              分类
            </NavLink>
            <NavLink className={navClass} to="/ops/invites">
              邀请码
            </NavLink>
            {user.superAdmin && (
              <NavLink className={navClass} to="/ops/admins">
                管理员
              </NavLink>
            )}
          </>
        )}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-end gap-4 border-b border-line bg-white px-6 py-3 text-sm">
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
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `mb-1 block rounded px-2 py-1.5 ${isActive ? "bg-slate-100 font-medium" : "text-slate-700 hover:bg-slate-50"}`;
}
