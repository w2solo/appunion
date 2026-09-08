import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ANDROID_STORE_LABELS,
  ANDROID_STORES,
  DESCRIPTION_MAX_GRAPHEMES,
  EXTRA_DOWNLOAD_DEFAULT_LABEL,
  EXTRA_DOWNLOAD_LABEL_MAX,
  LIST_SIZE_MAX,
  LIST_SIZE_MIN,
  PACKAGE_NAME_HINTS,
  PLATFORMS,
  PLATFORM_LABELS,
  TAGLINE_MAX_GRAPHEMES,
  graphemeLength,
  isAndroidStore,
  isValidHttpsUrl,
  isValidPackageName,
  type ExtraDownload,
  type Platform,
} from "@appunions/shared";
import { api } from "../shared/api";
import { ActionStatus, useActionFeedback } from "../shared/action-status";
import { platformLabel, statusLabel } from "../shared/status";
import { CategoryFields } from "../shared/category-fields";
import { AppStatsPanel } from "./app-stats";
import { AppIntegratePanel } from "./app-integrate";

type AppPlatform = {
  platform: Platform;
  packageName: string;
  downloadStores?: string[];
  extraDownloads?: ExtraDownload[];
};

type AppDetail = {
  id: string;
  name: string;
  iconUrl: string;
  tagline: string;
  description: string;
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
  { id: "integrate", label: "接入文档" },
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
      {tab === "integrate" && (
        <AppIntegratePanel
          appId={app.id}
          appName={app.name}
          platforms={app.platforms}
          listSize={app.listSize}
          hidden={app.pausedByDeveloper}
        />
      )}
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
  const { id } = useParams();
  const [tagline, setTagline] = useState(app.tagline);
  const [description, setDescription] = useState(app.description ?? "");

  useEffect(() => {
    setTagline(app.tagline);
    setDescription(app.description ?? "");
  }, [app.tagline, app.description]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name")),
      tagline,
      description,
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
      <StatusBar app={app} />
      <PlatformsSection app={app} onSaved={onSaved} />
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">资料</h2>
        <form className="mt-4 grid gap-3" onSubmit={(e) => void onSave(e)}>
          <label className="text-sm">
            名称
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name="name" defaultValue={app.name} />
          </label>
          <label className="text-sm">
            简介（{graphemeLength(tagline)}/{TAGLINE_MAX_GRAPHEMES}）
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              name="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </label>
          <label className="text-sm">
            更多描述（{graphemeLength(description)}/{DESCRIPTION_MAX_GRAPHEMES}）
            <textarea
              className="mt-1 min-h-[96px] w-full rounded border border-line px-3 py-2"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详情弹窗里展示，可留空"
            />
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
    </div>
  );
}

function ConfigTab({ app, onSaved }: { app: AppDetail; onSaved: () => Promise<void> }) {
  const { id } = useParams();
  const [listSize, setListSize] = useState(app.listSize);
  const save = useActionFeedback();
  const pause = useActionFeedback();

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
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">展示开关</h2>
        {app.pausedByOps ? (
          <p className="mt-2 text-sm text-red-700">运营已暂停本应用，开放接口不可用。</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              关闭后两件事同时发生：本应用不会出现在别人的互推列表里；你请求{" "}
              <code>GET /v1/info</code> 与 <code>GET /v1/apps/recommend</code> 都会返回{" "}
              <code>hidden: true</code>，recommend 没有列表。客户端应隐藏互推入口。这是「自己隐藏互推」的接口约定。
            </p>
            {app.pausedByDeveloper ? (
              <button
                className="mt-3 rounded bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={pause.busy}
                type="button"
                onClick={() =>
                  void pause.run(
                    () => api(`/dashboard/apps/${id}/resume`, { method: "POST" }).then(onSaved),
                    "已打开展示",
                  )
                }
              >
                {pause.busy ? "处理中…" : "打开展示"}
              </button>
            ) : (
              <button
                className="mt-3 rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                disabled={pause.busy}
                type="button"
                onClick={() => {
                  if (!confirm("关闭后自己不会出现在别人列表里，请求接口也不会返回列表。确定关闭？")) return;
                  void pause.run(
                    () => api(`/dashboard/apps/${id}/pause`, { method: "POST" }).then(onSaved),
                    "已隐藏互推",
                  );
                }}
              >
                {pause.busy ? "处理中…" : "关闭展示"}
              </button>
            )}
            <div className="mt-2">
              <ActionStatus error={pause.error} message={pause.message} />
            </div>
          </>
        )}
      </section>
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
    </div>
  );
}

function emptyStores(): Record<(typeof ANDROID_STORES)[number], boolean> {
  return {
    play: false,
    huawei: false,
    honor: false,
    xiaomi: false,
    oppo: false,
    vivo: false,
    tencent: false,
    coolapk: false,
  };
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
  const [androidStores, setAndroidStores] = useState(() => {
    const next = emptyStores();
    const android = app.platforms.find((p) => p.platform === "android");
    for (const store of android?.downloadStores ?? []) {
      if (isAndroidStore(store)) next[store] = true;
    }
    return next;
  });
  const [extraLabel, setExtraLabel] = useState(() => {
    const android = app.platforms.find((p) => p.platform === "android");
    return android?.extraDownloads?.[0]?.label || EXTRA_DOWNLOAD_DEFAULT_LABEL;
  });
  const [extraUrl, setExtraUrl] = useState(() => {
    const android = app.platforms.find((p) => p.platform === "android");
    return android?.extraDownloads?.[0]?.url ?? "";
  });

  useEffect(() => {
    const nextEnabled = { android: false, ios: false, harmonyos: false } as Record<Platform, boolean>;
    const nextNames = { android: "", ios: "", harmonyos: "" } as Record<Platform, string>;
    const nextStores = emptyStores();
    for (const p of app.platforms) {
      nextEnabled[p.platform] = true;
      nextNames[p.platform] = p.packageName;
    }
    const android = app.platforms.find((p) => p.platform === "android");
    for (const store of android?.downloadStores ?? []) {
      if (isAndroidStore(store)) nextStores[store] = true;
    }
    setEnabled(nextEnabled);
    setNames(nextNames);
    setAndroidStores(nextStores);
    setExtraLabel(android?.extraDownloads?.[0]?.label || EXTRA_DOWNLOAD_DEFAULT_LABEL);
    setExtraUrl(android?.extraDownloads?.[0]?.url ?? "");
  }, [app.platforms]);

  function togglePlatform(platform: Platform, checked: boolean) {
    setEnabled((prev) => ({ ...prev, [platform]: checked }));
    if (!checked) return;
    setNames((prev) => {
      if (prev[platform].trim()) return prev;
      const borrowed = PLATFORMS.filter((other) => other !== platform)
        .map((other) => prev[other].trim())
        .find(Boolean);
      if (!borrowed) return prev;
      return { ...prev, [platform]: borrowed };
    });
  }

  async function save() {
    await saveFb.run(async () => {
      const selected = PLATFORMS.filter((p) => enabled[p]);
      for (const p of selected) {
        const packageName = names[p].trim();
        const label = PLATFORM_LABELS[p];
        if (!packageName) throw new Error(`请填写 ${label} 包名`);
        if (!isValidPackageName(packageName)) {
          throw new Error(`${label} 包名格式无效，需为反向域名如 com.company.app`);
        }
      }
      if (enabled.android && extraUrl.trim()) {
        const downloadLabel = extraLabel.trim() || EXTRA_DOWNLOAD_DEFAULT_LABEL;
        if (graphemeLength(downloadLabel) > EXTRA_DOWNLOAD_LABEL_MAX) {
          throw new Error(`下载名称不能超过 ${EXTRA_DOWNLOAD_LABEL_MAX} 字`);
        }
        if (!isValidHttpsUrl(extraUrl.trim())) {
          throw new Error("下载地址须为 https 链接");
        }
      }
      const platforms = selected.map((p) => ({
        platform: p,
        packageName: names[p].trim(),
        ...(p === "android"
          ? {
              downloadStores: ANDROID_STORES.filter((store) => androidStores[store]),
              extraDownloads: extraUrl.trim()
                ? [{ label: extraLabel.trim() || EXTRA_DOWNLOAD_DEFAULT_LABEL, url: extraUrl.trim() }]
                : [],
            }
          : {}),
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
        勾选端并填写包名。Android 勾选上架的应用商店即可，商店跳转由包名按各店 schema 拼好后随接口返回；额外只需再填一条 https 下载地址。
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
                onChange={(e) => togglePlatform(p, e.target.checked)}
              />
              {PLATFORM_LABELS[p]}
            </label>
            {enabled[p] && (
              <>
                <input
                  className="mt-2 w-full rounded border border-line px-3 py-2 text-sm"
                  placeholder={PACKAGE_NAME_HINTS[p]}
                  value={names[p]}
                  onChange={(e) => setNames((prev) => ({ ...prev, [p]: e.target.value }))}
                />
                {p === "android" && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium">下载平台</p>
                      <p className="mt-0.5 text-xs text-muted">
                        不必填商店链接。接口会用包名拼出对应商店的跳转 URL。都不选则走系统应用商店。
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {ANDROID_STORES.map((store) => (
                          <label key={store} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={androidStores[store]}
                              onChange={(e) =>
                                setAndroidStores((prev) => ({ ...prev, [store]: e.target.checked }))
                              }
                            />
                            {ANDROID_STORE_LABELS[store]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">额外下载地址</p>
                      <p className="mt-0.5 text-xs text-muted">
                        只需一条 https 链接，例如官网或 APK。名称不超过 {EXTRA_DOWNLOAD_LABEL_MAX} 字，可留空。
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          className="w-28 rounded border border-line px-3 py-2 text-sm"
                          placeholder={EXTRA_DOWNLOAD_DEFAULT_LABEL}
                          value={extraLabel}
                          onChange={(e) => setExtraLabel(e.target.value)}
                        />
                        <input
                          className="min-w-[12rem] flex-1 rounded border border-line px-3 py-2 text-sm"
                          placeholder="https://"
                          value={extraUrl}
                          onChange={(e) => setExtraUrl(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
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
    text = "审核中可用 app_id 调 /v1 拉测试数据；通过后自动变为真实推荐。";
  } else if (app.reviewStatus === "rejected") {
    text = `已拒绝：${app.rejectedReason ?? ""}`;
  } else if (app.pausedByOps) {
    text = "运营已暂停本应用，开放接口不可用。";
  } else if (app.pausedByDeveloper) {
    text = "已隐藏互推：别人看不到你，info 与 recommend 都会返回 hidden，你也拿不到列表。";
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
