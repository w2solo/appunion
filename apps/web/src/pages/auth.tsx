import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../shared/api";
import { useAuth } from "../shared/auth";

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const next = params.get("next") || "/apps";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/dashboard/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      nav(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "失败");
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold">{mode === "login" ? "登录" : "注册"}</h1>
      <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-sm">
          邮箱
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          密码（至少 8 位）
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-brand py-2 text-white" type="submit">
          {mode === "login" ? "登录" : "注册并进入"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {mode === "login" ? (
          <>
            没有账号？<Link to="/register">注册</Link>。忘记密码请联系运营。
          </>
        ) : (
          <>
            已有账号？<Link to="/login">登录</Link>
          </>
        )}
      </p>
    </main>
  );
}
