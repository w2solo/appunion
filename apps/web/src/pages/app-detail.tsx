import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  LIST_SIZE_MAX,
  LIST_SIZE_MIN,
  PACKAGE_NAME_HINTS,
  PLATFORMS,
  PLATFORM_LABELS,
  graphemeLength,
  type Platform,
} from "@appunions/shared";
import { api } from "../shared/api";
import { ActionStatus, copyToClipboard, useActionFeedback } from "../shared/action-status";
import { KeyModal } from "../shared/key-modal";
import { platformLabel, statusLabel } from "../shared/status";
import { CategoryFields } from "../shared/category-fields";
import { AppStatsPanel } from "./app-stats";
import { AppIntegratePanel } from "./app-integrate";

type AppPlatform = { platform: Platform; packageName: string };

type AppDetail = {
  id: string;
  name: string;
  iconUrl: string;
  tagline: string;
  category: string;
  subcategory: string;
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
  listSize: number;
};

const TABS = [
  { id: "info", label: "基本信息" },
  { id: "config", label: "配置" },
  { id: "stats", label: "数据" },
  { id: "keys", label: "密钥" },
  { id: "integrate", label: "接入" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function parseTab(value: string | null): Tab {
  return TABS.some((t) => t.id === value) ? (value as Tab) : "info";
}

export function AppDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);

  async function load() {
    const data = await api<AppDetail>(`/dashboard/apps/${id}`);
    setApp(data);
  }

  useEffect(() => {
    load().catch((e: Error) => setLoadError(e.message));
  }, [id]);

  function setTab(next: Tab) {
    setParams(next === "info" ? {} : { tab: next }, { replace: true });
  }

  if (loadError) return <p className="text-red-600">{loadError}</p>;
  if (!app || !id) return <p className="text-muted">加载中…</p>;

  const s = statusLabel(app);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{app.name}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
      </div>
      <StatusBar app={app} />
      <nav className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.id ? "border-brand font-medium text-brand" : "border-transparent text-muted"
            }`}
            type="button"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "info" && <InfoTab app={app} setApp={setApp} onSaved={load} />}
      {tab === "config" && <ConfigTab app={app} onSaved={load} />}
      {tab === "stats" && <AppStatsPanel id={id} />}
      {tab === "keys" && <KeysTab app={app} apiKey={apiKey} setApiKey={setApiKey} onRotated={load} />}
      {tab === "integrate" && (
        <AppIntegratePanel appId={app.id} appName={app.name} platforms={app.platforms} listSize={app.listSize} />
      )}
      {apiKey && <KeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}

function InfoTab({
  app,
  setApp,
  onSaved,
}: {
  app: AppDetail;
  setApp: (app: AppDetail) => void;
  onSaved: () => Promise<void>;
}) {
  const profile = useActionFeedback();
  const pause = useActionFeedback();
  const { id } = useParams();

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name")),
      tagline: String(fd.get("tagline")),
      category: String(fd.get("category")),
      subcategory: String(fd.get("subcategory")),
    };
    const resubmit = app.reviewStatus === "rejected";
    await profile.run(async () => {
      await api(`/dashboard/apps/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (resubmit) await api(`/dashboard/apps/${id}/resubmit`, { method: "POST" });
      await onSaved();
    }, resubmit ? "已保存并重新提交" : "已保存");
  }

  return (
    <div className="space-y-6">
      <PlatformsSection app={app} onSaved={onSaved} />
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
          <CategoryFields
            category={app.category}
            subcategory={app.subcategory}
            onChange={(next) => setApp({ ...app, category: next.category, subcategory: next.subcategory })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="w-fit rounded bg-brand px-4 py-2 text-white disabled:opacity-50"
              disabled={profile.busy}
              type="submit"
            >
              {profile.busy
                ? "保存中…"
                : app.reviewStatus === "rejected"
                  ? "保存并重新提交"
                  : "保存"}
            </button>
            <ActionStatus error={profile.error} message={profile.message} />
          </div>
        </form>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">展示开关</h2>
        {app.pausedByOps ? (
          <p className="mt-2 text-sm text-red-700">运营已暂停本应用，开放接口不可用。</p>
        ) : app.pausedByDeveloper ? (
          <button
            className="mt-3 rounded bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={pause.busy}
            type="button"
            onClick={() => void pause.run(() => api(`/dashboard/apps/${id}/resume`, { method: "POST" }).then(onSaved), "已恢复展示")}
          >
            {pause.busy ? "处理中…" : "恢复展示"}
          </button>
        ) : (
          <button
            className="mt-3 rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
            disabled={pause.busy}
            type="button"
            onClick={() => {
              if (!confirm("暂停后不会出现在别人的列表里。开放接口仍可用。")) return;
              void pause.run(() => api(`/dashboard/apps/${id}/pause`, { method: "POST" }).then(onSaved), "已暂停展示");
            }}
          >
            {pause.busy ? "处理中…" : "暂停展示"}
          </button>
        )}
        <div className="mt-2">
          <ActionStatus error={pause.error} message={pause.message} />
        </div>
      </section>
    </div>
  );
}

function ConfigTab({ app, onSaved }: { app: AppDetail; onSaved: () => Promise<void> }) {
  const { id } = useParams();
  const [listSize, setListSize] = useState(app.listSize);
  const save = useActionFeedback();

  useEffect(() => {
    setListSize(app.listSize);
  }, [app.listSize]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.run(async () => {
      if (!Number.isInteger(listSize) || listSize < LIST_SIZE_MIN || listSize > LIST_SIZE_MAX) {
        throw new Error(`请输入 ${LIST_SIZE_MIN}–${LIST_SIZE_MAX} 的整数`);
      }
      await api(`/dashboard/apps/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ listSize }),
      });
      await onSaved();
    }, "已保存");
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="font-medium">列表面板</h2>
      <p className="mt-1 text-sm text-muted">
        客户端只展示一块内嵌列表，不提供「查看全部」。这里设置每次随机展示几条，换一批会按这个数量重新抽取。
      </p>
      <form className="mt-4 max-w-xs space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-sm">
          展示个数（{LIST_SIZE_MIN}–{LIST_SIZE_MAX}）
          <input
            type="number"
            min={LIST_SIZE_MIN}
            max={LIST_SIZE_MAX}
            step={1}
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={Number.isFinite(listSize) ? listSize : ""}
            onChange={(e) => setListSize(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50" disabled={save.busy}>
            {save.busy ? "保存中…" : "保存"}
          </button>
          <ActionStatus error={save.error} message={save.message} />
        </div>
      </form>
    </section>
  );
}

function KeysTab({
  app,
  apiKey,
  setApiKey,
  onRotated,
}: {
  app: AppDetail;
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  onRotated: () => Promise<void>;
}) {
  const { id } = useParams();
  const creds = useActionFeedback();
  const copyId = useActionFeedback();

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="font-medium">密钥</h2>
      <p className="mt-2 text-sm text-muted">
        客户端用 Bearer 令牌调开放接口。明文只在创建或重置时展示一次，离开后无法再看。
      </p>
      <p className="mt-4 text-sm">
        app_id：<code className="rounded bg-slate-100 px-1">{app.id}</code>
        <button
          className="ml-2 text-brand"
          type="button"
          onClick={() => void copyId.run(() => copyToClipboard(app.id), "已复制")}
        >
          {copyId.message ? "已复制" : "复制"}
        </button>
        {copyId.error && <span className="ml-2 text-sm text-red-600">{copyId.error}</span>}
      </p>
      <p className="mt-2 text-sm">
        api_key：<code className="rounded bg-slate-100 px-1">{app.keyPrefix}****</code>
      </p>
      <p className="mt-2 text-xs text-muted">Authorization: Bearer &lt;你的密钥&gt;</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={creds.busy}
          type="button"
          onClick={() => {
            if (!confirm("重置后旧密钥立刻失效，确定吗？")) return;
            void creds.run(async () => {
              const d = await api<{ apiKey: string }>(`/dashboard/apps/${id}/api-key/rotate`, { method: "POST" });
              setApiKey(d.apiKey);
              await onRotated();
            }, "密钥已重置");
          }}
        >
          {creds.busy ? "重置中…" : "重置密钥"}
        </button>
        <ActionStatus error={creds.error} message={apiKey ? "" : creds.message} />
      </div>
    </section>
  );
}

function PlatformsSection({
  app,
  onSaved,
}: {
  app: AppDetail;
  onSaved: () => Promise<void>;
}) {
  const saveFb = useActionFeedback();
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
    await saveFb.run(async () => {
      const platforms = PLATFORMS.filter((p) => enabled[p]).map((p) => ({
        platform: p,
        packageName: names[p].trim(),
      }));
      await api(`/dashboard/apps/${app.id}/platforms`, {
        method: "PUT",
        body: JSON.stringify({ platforms }),
      });
      await onSaved();
    }, "平台已保存");
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="font-medium">支持的平台</h2>
      <p className="mt-1 text-sm text-muted">
        勾选端并填写包名。客户端用包名打开对应应用商店，不需要商店链接。
      </p>
      {app.platforms.length === 0 && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          请至少添加一个平台，否则无法出现在别人的列表面板里。
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={saveFb.busy}
          type="button"
          onClick={() => void save()}
        >
          {saveFb.busy ? "保存中…" : "保存平台"}
        </button>
        <ActionStatus error={saveFb.error} message={saveFb.message} />
      </div>
      {app.platforms.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          当前：{app.platforms.map((p) => `${platformLabel(p.platform)} ${p.packageName}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function StatusBar({ app }: { app: AppDetail }) {
  let text = "";
  if (app.reviewStatus === "pending") {
    text = "审核中，通过前开放接口会返回未通过。你可以先到「接入」用后台预览写 UI。";
  } else if (app.reviewStatus === "rejected") {
    text = `已拒绝：${app.rejectedReason ?? ""}`;
  } else if (app.pausedByOps) {
    text = "运营已暂停本应用，开放接口不可用。";
  } else if (app.pausedByDeveloper) {
    text = "已暂停，不会出现在别人的列表里。开放接口仍可用。";
  } else if (app.graceDaysLeft > 0) {
    text = `观察期还剩 ${app.graceDaysLeft} 天。请尽快在 App 里真实展示列表并上报曝光，否则到期会暂时离开推荐池。`;
  } else if (!app.inRecommendPool) {
    text = `还差 ${app.reciprocityGap} 次有效曝光才能回到推荐池。暂时不会出现在别人的列表面板里。`;
  } else {
    text = "当前在推荐池中，可能被随机抽到。";
  }
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
      {text}
    </div>
  );
}
