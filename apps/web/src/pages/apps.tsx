import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../shared/api";
import { platformLabel, statusLabel } from "../shared/status";

type Item = {
  id: string;
  name: string;
  iconUrl: string;
  platforms: { platform: string; packageName: string }[];
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  inRecommendPool: boolean;
  graceDaysLeft: number;
  impressionsReceived7d: number;
};

export function AppsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: Item[] }>("/dashboard/apps")
      .then((d) => setItems(d.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!items) return <p className="text-muted">加载中…</p>;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white p-12 text-center">
        <p className="text-muted">还没有应用</p>
        <Link className="mt-4 inline-block rounded bg-brand px-4 py-2 text-white" to="/apps/new">
          创建应用
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">我的应用</h1>
        <Link className="rounded bg-brand px-3 py-2 text-sm text-white" to="/apps/new">
          创建应用
        </Link>
      </div>
      <table className="w-full border-collapse overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
        <thead className="bg-slate-50 text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">应用</th>
            <th className="px-4 py-3 font-medium">端</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">近 7 天曝光</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((app) => {
            const s = statusLabel(app);
            return (
              <tr key={app.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={app.iconUrl} alt="" className="h-9 w-9 rounded" />
                    <span>{app.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {app.platforms.length === 0
                    ? "未配置"
                    : app.platforms.map((p) => platformLabel(p.platform)).join(" / ")}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
                </td>
                <td className="px-4 py-3">{app.impressionsReceived7d}</td>
                <td className="px-4 py-3 text-right">
                  <Link className="text-brand" to={`/apps/${app.id}`}>
                    详情
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
