import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PACKAGE_NAME_HINTS,
  PLATFORMS,
  PLATFORM_LABELS,
  graphemeLength,
  type Platform,
} from "@appunions/shared";
import { api } from "../shared/api";
import { KeyModal } from "../shared/key-modal";
import { platformLabel, statusLabel } from "../shared/status";

type AppPlatform = { platform: Platform; packageName: string };

type AppDetail = {
  id: string;
  name: string;
  iconUrl: string;
  tagline: string;
  category: string;
  platforms: AppPlatform[];
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  rejectedReason: string | null;
  inRecommendPool: boolean;
  contributedImpressions7d: number;
  graceDaysLeft: number;
  reciprocityThreshold: number;
  reciprocityGap: number;
  keyPrefix: string;
};

export function AppDetailPage() {
  const { id } = useParams();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);

  async function load() {
    const data = await api<AppDetail>(`/dashboard/apps/${id}`);
    setApp(data);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!app) return <p className="text-muted">加载中…</p>;

  const s = statusLabel(app);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name")),
      tagline: String(fd.get("tagline")),
      category: String(fd.get("category")),
    };
    try {
      if (app?.reviewStatus === "rejected") {
        await api(`/dashboard/apps/${id}`, { method: "PATCH", body: JSON.stringify(body) });
        await api(`/dashboard/apps/${id}/resubmit`, { method: "POST" });
      } else {
        await api(`/dashboard/apps/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{app.name}</h1>
        <Link className="text-sm text-brand" to={`/apps/${app.id}/stats`}>
          查看数据
        </Link>
      </div>
      <StatusBar app={app} badge={s.text} />
      <PlatformsSection app={app} onSaved={load} onError={setError} />
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">资料</h2>
        <form className="mt-4 grid gap-3" onSubmit={(e) => void onSave(e)}>
          <label className="text-sm">
            名称
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name="name" defaultValue={app.name} />
          </label>
          <label className="text-sm">
            描述（{graphemeLength(app.tagline)}/30）
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name="tagline" defaultValue={app.tagline} />
          </label>
          <label className="text-sm">
            分类
            <select className="mt-1 w-full rounded border border-line px-3 py-2" name="category" defaultValue={app.category}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <button className="w-fit rounded bg-brand px-4 py-2 text-white" type="submit">
            {app.reviewStatus === "rejected" ? "保存并重新提交" : "保存"}
          </button>
        </form>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">凭证</h2>
        <p className="mt-2 text-sm">
          app_id：<code className="rounded bg-slate-100 px-1">{app.id}</code>
          <button className="ml-2 text-brand" onClick={() => void navigator.clipboard.writeText(app.id)}>
            复制
          </button>
        </p>
        <p className="mt-2 text-sm">
          api_key：<code className="rounded bg-slate-100 px-1">{app.keyPrefix}****</code>
        </p>
        <p className="mt-2 text-xs text-muted">Authorization: Bearer &lt;你的密钥&gt;</p>
        <button
          className="mt-3 rounded border border-line px-3 py-1.5 text-sm"
          onClick={() => {
            if (!confirm("重置后旧密钥立刻失效，确定吗？")) return;
            api<{ apiKey: string }>(`/dashboard/apps/${id}/api-key/rotate`, { method: "POST" })
              .then((d) => {
                setApiKey(d.apiKey);
                return load();
              })
              .catch((e: Error) => setError(e.message));
          }}
        >
          重置密钥
        </button>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">展示开关</h2>
        {app.pausedByOps ? (
          <p className="mt-2 text-sm text-red-700">运营已暂停本应用，开放接口不可用。</p>
        ) : app.pausedByDeveloper ? (
          <button
            className="mt-3 rounded bg-brand px-3 py-2 text-sm text-white"
            onClick={() =>
              api(`/dashboard/apps/${id}/resume`, { method: "POST" })
                .then(load)
                .catch((e: Error) => setError(e.message))
            }
          >
            恢复展示
          </button>
        ) : (
          <button
            className="mt-3 rounded border border-line px-3 py-2 text-sm"
            onClick={() => {
              if (!confirm("暂停后不会出现在别人的列表里。开放接口仍可用。")) return;
              api(`/dashboard/apps/${id}/pause`, { method: "POST" })
                .then(load)
                .catch((e: Error) => setError(e.message));
            }}
          >
            暂停展示
          </button>
        )}
      </section>
      {apiKey && <KeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}

function PlatformsSection({
  app,
  onSaved,
  onError,
}: {
  app: AppDetail;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<Record<Platform, boolean>>(() => {
    const next = { android: false, ios: false, harmonyos: false };
    for (const p of app.platforms) next[p.platform] = true;
    return next;
  });
  const [names, setNames] = useState<Record<Platform, string>>(() => {
    const next = { android: "", ios: "", harmonyos: "" };
    for (const p of app.platforms) next[p.platform] = p.packageName;
    return next;
  });

  useEffect(() => {
    const nextEnabled = { android: false, ios: false, harmonyos: false } as Record<Platform, boolean>;
    const nextNames = { android: "", ios: "", harmonyos: "" } as Record<Platform, string>;
    for (const p of app.platforms) {
      nextEnabled[p.platform] = true;
      nextNames[p.platform] = p.packageName;
    }
    setEnabled(nextEnabled);
    setNames(nextNames);
  }, [app.platforms]);

  async function save() {
    setBusy(true);
    try {
      const platforms = PLATFORMS.filter((p) => enabled[p]).map((p) => ({
        platform: p,
        packageName: names[p].trim(),
      }));
      await api(`/dashboard/apps/${app.id}/platforms`, {
        method: "PUT",
        body: JSON.stringify({ platforms }),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "保存平台失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="font-medium">支持的平台</h2>
      <p className="mt-1 text-sm text-muted">
        勾选端并填写包名。客户端用包名打开对应应用商店，不需要商店链接。
      </p>
      {app.platforms.length === 0 && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          请至少添加一个平台，否则无法出现在推荐和全量列表里。
        </p>
      )}
      <div className="mt-4 space-y-3">
        {PLATFORMS.map((p) => (
          <div key={p} className="rounded border border-line p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={enabled[p]}
                onChange={(e) => setEnabled((prev) => ({ ...prev, [p]: e.target.checked }))}
              />
              {PLATFORM_LABELS[p]}
            </label>
            {enabled[p] && (
              <input
                className="mt-2 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder={PACKAGE_NAME_HINTS[p]}
                value={names[p]}
                onChange={(e) => setNames((prev) => ({ ...prev, [p]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <button className="mt-4 rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
        {busy ? "保存中…" : "保存平台"}
      </button>
      {app.platforms.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          当前：{app.platforms.map((p) => `${platformLabel(p.platform)} ${p.packageName}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function StatusBar({ app, badge }: { app: AppDetail; badge: string }) {
  let text = "";
  if (app.reviewStatus === "pending") {
    text = "审核中，通过前开放接口会返回未通过。你可以先按文档写代码。";
  } else if (app.reviewStatus === "rejected") {
    text = `已拒绝：${app.rejectedReason ?? ""}`;
  } else if (app.pausedByOps) {
    text = "运营已暂停本应用，开放接口不可用。";
  } else if (app.pausedByDeveloper) {
    text = "已暂停，不会出现在别人的列表里。开放接口仍可用。";
  } else if (app.graceDaysLeft > 0) {
    text = `观察期还剩 ${app.graceDaysLeft} 天。请尽快在 App 里真实展示列表并上报曝光，否则到期会暂时离开推荐池。`;
  } else if (!app.inRecommendPool) {
    text = `还差 ${app.reciprocityGap} 次有效曝光才能回到推荐池。全量列表里别人仍可能看到你。`;
  } else {
    text = "当前在推荐池中，可能被随机抽到。";
  }
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
      <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{badge}</span>
      {text}
    </div>
  );
}
