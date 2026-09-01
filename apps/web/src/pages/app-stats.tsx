import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../shared/api";

type Stats = {
  range: string;
  impressionsReceived: number;
  clicksReceived: number;
  ctrReceived: number | null;
  impressionsGiven: number;
  clicksGiven: number;
  inRecommendPool: boolean;
  graceDaysLeft: number;
  reciprocityThreshold: number;
  contributedImpressions7d: number;
  reciprocityGap: number;
  series: {
    day: string;
    impressionsReceived: number;
    clicksReceived: number;
    impressionsGiven: number;
    clicksGiven: number;
  }[];
};

export function AppStatsPage() {
  const { id } = useParams();
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>(`/dashboard/apps/${id}/stats?range=${range}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id, range]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-muted">加载中…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">数据</h1>
        <Link className="text-sm text-brand" to={`/apps/${id}`}>
          返回详情
        </Link>
      </div>
      <div className="mb-4 flex gap-2 text-sm">
        <button className={range === "7d" ? "font-semibold" : "text-muted"} onClick={() => setRange("7d")}>
          7 天
        </button>
        <button className={range === "30d" ? "font-semibold" : "text-muted"} onClick={() => setRange("30d")}>
          30 天
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Card label="获得曝光" value={data.impressionsReceived} />
        <Card label="获得点击" value={data.clicksReceived} />
        <Card label="贡献曝光" value={data.impressionsGiven} />
        <Card label="贡献点击" value={data.clicksGiven} />
      </div>
      <p className="mt-3 text-sm text-muted">
        CTR：{data.ctrReceived == null ? "—" : `${(data.ctrReceived * 100).toFixed(2)}%`} · 推荐池：
        {data.inRecommendPool ? "在" : "不在"} · 观察期剩 {data.graceDaysLeft} 天 · 门槛 {data.reciprocityThreshold}，已贡献{" "}
        {data.contributedImpressions7d}，缺口 {data.reciprocityGap}
      </p>
      {data.impressionsReceived + data.impressionsGiven === 0 && (
        <p className="mt-4 text-sm text-muted">通过并接入后这里会有数。</p>
      )}
      <div className="mt-6 h-72 rounded-lg bg-white p-4 shadow-sm">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="impressionsReceived" name="获得曝光" stroke="#1d4ed8" />
            <Line type="monotone" dataKey="clicksReceived" name="获得点击" stroke="#0f766e" />
            <Line type="monotone" dataKey="impressionsGiven" name="贡献曝光" stroke="#a16207" />
            <Line type="monotone" dataKey="clicksGiven" name="贡献点击" stroke="#be123c" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
