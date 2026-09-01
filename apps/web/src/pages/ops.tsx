import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../shared/api";
import { platformLabel, statusLabel } from "../shared/status";

type AdminApp = {
  id: string;
  name: string;
  iconUrl: string;
  platform: string;
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  inRecommendPool: boolean;
  developerEmail: string;
  storeUrl: string;
  tagline: string;
  deeplink: string | null;
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
                <td className="px-4 py-3">{platformLabel(app.platform)}</td>
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
            {platformLabel(app.platform)} · {app.developerEmail}
          </p>
          <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
        </div>
      </div>
      <p>{app.tagline}</p>
      <p>
        <a className="text-brand" href={app.storeUrl} target="_blank" rel="noreferrer">
          打开商店链接
        </a>
      </p>
      {app.deeplink && <p className="text-sm">deeplink: {app.deeplink}</p>}
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
  const [cfg, setCfg] = useState<Record<string, number> | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<Record<string, number>>("/admin/config").then(setCfg);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("会立刻重算推荐池，确定保存？")) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, number> = {};
    for (const [k, v] of fd.entries()) body[k] = Number(v);
    const updated = await api<Record<string, number>>("/admin/config", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setCfg(updated);
    setMsg("已保存并重算推荐池");
  }

  if (!cfg) return <p className="text-muted">加载中…</p>;

  const fields: [string, string][] = [
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
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">门槛参数</h1>
      <form className="mt-6 space-y-3 rounded-lg bg-white p-6 shadow-sm" onSubmit={(e) => void onSubmit(e)}>
        {fields.map(([k, label]) => (
          <label key={k} className="block text-sm">
            {label}
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name={k} type="number" defaultValue={cfg[k]} />
          </label>
        ))}
        <button className="rounded bg-brand px-4 py-2 text-white">保存</button>
        {msg && <p className="text-sm text-green-700">{msg}</p>}
      </form>
    </div>
  );
}
