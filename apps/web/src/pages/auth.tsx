import { FormEvent, useEffect, useState } from "react";
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
  const [inviteCode, setInviteCode] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("next") || "/apps";
  const nextQuery = next !== "/apps" ? `?next=${encodeURIComponent(next)}` : "";
  const isRegister = mode === "register";

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function payload() {
    return isRegister ? { email, code, inviteCode } : { email, code };
  }

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      const res = await api<{ sent: boolean; emailed: boolean; devCode?: string }>(
        "/dashboard/auth/send-code",
        { method: "POST", body: JSON.stringify(isRegister ? { email, inviteCode } : { email }) },
      );
      setSent(true);
      setWait(60);
      setDevCode(res.devCode ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/dashboard/auth/verify", {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      await refresh();
      nav(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : isRegister ? "注册失败" : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold">{isRegister ? "邀请码注册" : "邮箱验证码登录"}</h1>
      <p className="mt-2 text-sm text-muted">
        {isRegister
          ? "需要管理员发放的邀请码。验证成功后不用设置密码。"
          : "已有账号用邮箱验证码登录。新用户需要邀请码才能注册。"}
      </p>
      {!sent ? (
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSend(e)}>
          {isRegister && (
            <label className="block text-sm">
              邀请码
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 tracking-widest"
                required
                autoComplete="off"
                placeholder="XXXX-XXXX"
                value={inviteCode}
                onChange={(e) =>
                  setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))
                }
              />
            </label>
          )}
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded bg-brand py-2 text-white disabled:opacity-50" disabled={busy} type="submit">
            {busy ? "发送中…" : "发送验证码"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => void onVerify(e)}>
          <p className="text-sm text-muted">验证码已发送到 {email}</p>
          {devCode && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              本地未配置发信，验证码是 <strong>{devCode}</strong>
            </p>
          )}
          <label className="block text-sm">
            6 位验证码
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2 tracking-widest"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded bg-brand py-2 text-white disabled:opacity-50" disabled={busy || code.length !== 6} type="submit">
            {busy ? (isRegister ? "注册中…" : "登录中…") : isRegister ? "注册并登录" : "登录"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-brand disabled:text-muted"
            disabled={wait > 0 || busy}
            onClick={() => void sendCode()}
          >
            {wait > 0 ? `${wait} 秒后可重新发送` : "重新发送"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-muted"
            onClick={() => {
              setSent(false);
              setCode("");
              setDevCode("");
              setError("");
            }}
          >
            返回修改
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        {isRegister ? (
          <>
            已有账号？<Link className="text-brand" to={`/login${nextQuery}`}>去登录</Link>
          </>
        ) : (
          <>
            没有账号？<Link className="text-brand" to={`/register${nextQuery}`}>使用邀请码注册</Link>
          </>
        )}
      </p>
    </main>
  );
}
