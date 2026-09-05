import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../shared/api";
import { platformLabel, statusLabel } from "../shared/status";

type AdminApp = {
  id: string;
  name: string;
  iconUrl: string;
  platforms: { platform: string; packageName: string }[];
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  inRecommendPool: boolean;
  developerEmail: string;
  tagline: string;
  rejectedReason: string | null;
  createdAt: string;
  reviews?: { id: string; action: string; reason: string | null; createdAt: string }[];
};

export function OpsReviewPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";
  const [items, setItems] = useState<AdminApp[]>([]);

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    api<{ items: AdminApp[] }>(`/admin/apps${q}`).then((d) => setItems(d.items));
  }, [status]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">审核</h1>
      <div className="my-4 flex gap-3 text-sm">
        {["pending", "approved", "rejected", "ops_paused"].map((s) => (
          <button key={s} className={status === s ? "font-semibold" : "text-muted"} onClick={() => setParams({ status: s })}>
            {s === "pending" ? "待审" : s === "approved" ? "已通过" : s === "rejected" ? "已拒绝" : "运营暂停"}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-muted">没有待审应用</p>
      ) : (
        <table className="w-full rounded-lg bg-white text-left text-sm shadow-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3">应用</th>
              <th className="px-4 py-3">端</th>
              <th className="px-4 py-3">开发者</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((app) => (
              <tr key={app.id} className="border-t border-line">
                <td className="px-4 py-3">{app.name}</td>
                <td className="px-4 py-3">
                  {app.platforms.length === 0
                    ? "未配置"
                    : app.platforms.map((p) => platformLabel(p.platform)).join(" / ")}
                </td>
                <td className="px-4 py-3">{app.developerEmail}</td>
                <td className="px-4 py-3 text-right">
                  <Link className="text-brand" to={`/ops/apps/${app.id}`}>
                    审核
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function OpsAppPage() {
  const { id } = useParams();
  const [app, setApp] = useState<AdminApp | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function load() {
    return api<AdminApp>(`/admin/apps/${id}`).then(setApp);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [id]);

  async function act(path: string, body?: object) {
    setError("");
    try {
      await api(`/admin/apps/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失败");
    }
  }

  if (!app) return <p className="text-muted">加载中…</p>;
  const s = statusLabel(app);

  return (
    <div className="space-y-4">
      <Link className="text-sm text-brand" to="/ops/review">
        返回队列
      </Link>
      <div className="flex items-center gap-4">
        <img src={app.iconUrl} alt="" className="h-16 w-16 rounded" />
        <div>
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <p className="text-sm text-muted">
            {(app.platforms.length === 0
              ? "未配置平台"
              : app.platforms.map((p) => platformLabel(p.platform)).join(" / "))}{" "}
            · {app.developerEmail}
          </p>
          <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
        </div>
      </div>
      <p>{app.tagline}</p>
      {app.platforms.length === 0 ? (
        <p className="text-sm text-amber-800">尚未配置平台和包名。</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {app.platforms.map((p) => (
            <li key={p.platform}>
              {platformLabel(p.platform)}：<code className="rounded bg-slate-100 px-1">{p.packageName}</code>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-green-700 px-3 py-2 text-sm text-white" onClick={() => void act("approve")}>
          通过
        </button>
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!reason.trim()) return;
            void act("reject", { reason });
          }}
        >
          <input
            className="rounded border border-line px-2"
            placeholder="拒绝原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="rounded bg-red-700 px-3 py-2 text-sm text-white">拒绝</button>
        </form>
        <button
          className="rounded border border-line px-3 py-2 text-sm"
          onClick={() => {
            const r = prompt("暂停原因");
            if (!r) return;
            void act("pause", { reason: r });
          }}
        >
          运营暂停
        </button>
        <button className="rounded border border-line px-3 py-2 text-sm" onClick={() => void act("resume")}>
          恢复
        </button>
      </div>
      {app.reviews && app.reviews.length > 0 && (
        <ul className="text-sm text-muted">
          {app.reviews.map((r) => (
            <li key={r.id}>
              {r.action} {r.reason ?? ""} · {new Date(r.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpsAnomaliesPage() {
  const [items, setItems] = useState<{ id: string; appId: string; appName: string; type: string; window: string; createdAt: string }[]>(
    [],
  );
  useEffect(() => {
    api<{ items: typeof items }>("/admin/anomalies").then((d) => setItems(d.items));
  }, []);
  return (
    <div>
      <h1 className="text-2xl font-semibold">异常 CTR</h1>
      <p className="mt-2 text-sm text-muted">不会自动封禁，请到审核详情决定是否暂停。</p>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="rounded bg-white p-3 shadow-sm">
            <Link className="text-brand" to={`/ops/apps/${i.appId}`}>
              {i.appName}
            </Link>{" "}
            · {i.type} · {i.window} · {new Date(i.createdAt).toLocaleString()}
          </li>
        ))}
        {items.length === 0 && <li className="text-muted">暂无异常</li>}
      </ul>
    </div>
  );
}

export function OpsConfigPage() {
  const [cfg, setCfg] = useState<OpsConfig | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<OpsConfig>("/admin/config").then(setCfg);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("会立刻重算推荐池，确定保存？")) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, number> = {};
    for (const [k, v] of fd.entries()) body[k] = Number(v);
    const updated = await api<OpsConfig>("/admin/config", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setCfg(updated);
    setMsg("已保存并重算推荐池");
  }

  if (!cfg) return <p className="text-muted">加载中…</p>;

  const fields: [keyof OpsConfig, string][] = [
    ["graceDays", "观察天数"],
    ["reciprocityImpressions", "互惠曝光门槛"],
    ["impressionDedupMinutes", "曝光去重分钟"],
    ["recommendCacheSeconds", "推荐池缓存秒"],
    ["rateRecommendPerMin", "recommend 每分钟"],
    ["rateListPerMin", "list 每分钟"],
    ["rateImpressionsPerMin", "曝光每分钟条数"],
    ["rateClicksPerMin", "点击每分钟"],
  ];

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">设置</h1>
      <form className="space-y-3 rounded-lg bg-white p-6 shadow-sm" onSubmit={(e) => void onSubmit(e)}>
        <h2 className="font-medium">门槛参数</h2>
        {fields.map(([k, label]) => (
          <label key={k} className="block text-sm">
            {label}
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name={k} type="number" defaultValue={cfg[k]} />
          </label>
        ))}
        <button className="rounded bg-brand px-4 py-2 text-white">保存参数</button>
        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </form>
    </div>
  );
}

type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "developer";
  superAdmin: boolean;
};

export function OpsAdminsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(search = q) {
    setError("");
    const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const data = await api<{ items: AdminUser[] }>(`/admin/users${query}`);
    setItems(data.items);
  }

  useEffect(() => {
    void load("").catch((e: Error) => setError(e.message));
  }, []);

  async function setRole(user: AdminUser, role: "admin" | "developer") {
    const next = role === "admin" ? "设为普通管理员" : "取消管理员";
    if (!confirm(`确定将 ${user.email} ${next}？`)) return;
    setBusyId(user.id);
    setError("");
    try {
      const updated = await api<AdminUser>(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setItems((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">管理员</h1>
      <p className="text-sm text-muted">
        超级管理员固定为 <code className="rounded bg-slate-100 px-1">cmlanche@qq.com</code>
        。只能把已经注册过的用户标成普通管理员；对方刷新页面或重新登录后即可看到审核台。普通管理员可以审核应用、改门槛参数，但不能再管理管理员。
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load().catch((err: Error) => setError(err.message));
        }}
      >
        <input
          className="flex-1 rounded border border-line px-3 py-2 text-sm"
          placeholder="搜索已注册邮箱"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="rounded bg-brand px-4 py-2 text-sm text-white" type="submit">
          搜索
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 ? (
        <p className="text-muted">没有找到已注册用户</p>
      ) : (
        <table className="w-full rounded-lg bg-white text-left text-sm shadow-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">角色</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  {user.superAdmin ? "超级管理员" : user.role === "admin" ? "普通管理员" : "开发者"}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.superAdmin ? (
                    <span className="text-muted">固定</span>
                  ) : user.role === "admin" ? (
                    <button
                      className="text-red-700 disabled:text-muted"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user, "developer")}
                      type="button"
                    >
                      取消管理员
                    </button>
                  ) : (
                    <button
                      className="text-brand disabled:text-muted"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user, "admin")}
                      type="button"
                    >
                      设为管理员
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type OpsConfig = {
  graceDays: number;
  reciprocityImpressions: number;
  impressionDedupMinutes: number;
  recommendCacheSeconds: number;
  rateRecommendPerMin: number;
  rateListPerMin: number;
  rateImpressionsPerMin: number;
  rateClicksPerMin: number;
};
