import { useEffect, useMemo, useState } from "react";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@appunions/shared";
import { api } from "../shared/api";
import { ActionStatus, copyToClipboard, useActionFeedback } from "../shared/action-status";
import { platformLabel } from "../shared/status";

type ListingItem = {
  id: string;
  name: string;
  icon_url: string;
  tagline: string;
  category: string;
  subcategory: string;
  platform: Platform;
  package_name: string;
};

type Endpoint = "recommend" | "list";

export function AppIntegratePanel({
  appId,
  appName,
  platforms,
}: {
  appId: string;
  appName: string;
  platforms: { platform: Platform; packageName: string }[];
}) {
  const [endpoint, setEndpoint] = useState<Endpoint>("recommend");
  const [platform, setPlatform] = useState<Platform>(platforms[0]?.platform ?? "android");
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<unknown>(null);
  const copyPrompt = useActionFeedback();
  const copyCurl = useActionFeedback();
  const send = useActionFeedback();

  useEffect(() => {
    if (platforms.length > 0 && !platforms.some((p) => p.platform === platform)) {
      setPlatform(platforms[0]!.platform);
    }
  }, [platforms, platform]);

  const v1Path =
    endpoint === "recommend"
      ? `/v1/apps/recommend?platform=${platform}&limit=${limit}`
      : `/v1/apps?platform=${platform}&page=${page}&page_size=${pageSize}`;

  const curl = `curl -s '${window.location.origin}${v1Path}' \\\n  -H 'Authorization: Bearer <你的密钥>'`;

  const items = useMemo(() => {
    if (!result || typeof result !== "object" || !("items" in result)) return [];
    return Array.isArray((result as { items: unknown }).items) ? ((result as { items: ListingItem[] }).items ?? []) : [];
  }, [result]);

  async function run() {
    await send.run(async () => {
      const path =
        endpoint === "recommend"
          ? `/dashboard/apps/${appId}/preview/recommend?platform=${platform}&limit=${limit}`
          : `/dashboard/apps/${appId}/preview/apps?platform=${platform}&page=${page}&page_size=${pageSize}`;
      const data = await api(path);
      setResult(data);
    }, "已返回结果");
  }

  const prompt = buildIntegratePrompt({
    appId,
    appName,
    platforms,
    sample: result,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">API 请求测试</h2>
        <p className="mt-1 text-sm text-muted">
          用当前登录态预览正式接口会返回的 JSON，不消耗 API Key，也不计入曝光和点击。审核通过后，客户端请改用密钥请求{" "}
          <code>/v1</code>。
        </p>
        {platforms.length === 0 && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            请先在「基本信息」里至少配置一个平台，才能按端拉取列表。
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {(["recommend", "list"] as const).map((ep) => (
            <button
              key={ep}
              className={`rounded px-3 py-1.5 ${endpoint === ep ? "bg-brand text-white" : "border border-line"}`}
              type="button"
              onClick={() => {
                setEndpoint(ep);
                setResult(null);
                send.reset();
              }}
            >
              {ep === "recommend" ? "推荐" : "全量列表"}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            端
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {(platforms.length > 0 ? platforms.map((p) => p.platform) : [...PLATFORMS]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {endpoint === "recommend" ? (
            <label className="text-sm">
              limit（最多 10）
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="number"
                min={1}
                max={10}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
          ) : (
            <>
              <label className="text-sm">
                page
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2"
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                page_size（最大 50）
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2"
                  type="number"
                  min={1}
                  max={50}
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                />
              </label>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={send.busy || platforms.length === 0}
            type="button"
            onClick={() => void run()}
          >
            {send.busy ? "请求中…" : "发送请求"}
          </button>
          <ActionStatus error={send.error} message={send.message} />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>客户端正式请求</span>
            <button
              className="text-brand"
              type="button"
              onClick={() => void copyCurl.run(() => copyToClipboard(curl), "已复制")}
            >
              {copyCurl.message ? "已复制" : "复制 curl"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{curl}</pre>
        </div>
        {result != null && (
          <>
            <h3 className="mt-5 text-sm font-medium">返回数据</h3>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-100 p-3 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
            {items.length > 0 && (
              <ul className="mt-4 max-w-sm space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <img src={item.icon_url} alt="" className="h-12 w-12 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="truncate text-xs text-muted">{item.tagline}</div>
                    </div>
                    <span className="text-xs text-muted">{platformLabel(item.platform)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="mt-6 border-t border-line pt-4 text-sm">
          <h3 className="font-medium">曝光与点击（正式环境上报，后台不代发）</h3>
          <p className="mt-1 text-muted">卡片进入可视区域后再报曝光；用户点击后再报点击，然后用 package_name 打开商店。</p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`POST /v1/events/impressions
{
  "platform": "${platform}",
  "client_id": "<设备上持久化的 UUID>",
  "impressions": [
    { "app_id": "<列表里的 id>", "idempotency_key": "<UUID>", "visible": true }
  ]
}

POST /v1/events/clicks
{
  "platform": "${platform}",
  "client_id": "<同一设备 UUID>",
  "app_id": "<被点击的 id>",
  "idempotency_key": "<UUID>"
}`}</pre>
        </div>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">接入 Prompt</h2>
          <button
            className="rounded bg-brand px-3 py-1.5 text-sm text-white"
            type="button"
            onClick={() => void copyPrompt.run(() => copyToClipboard(prompt), "已复制")}
          >
            {copyPrompt.message ? "已复制" : "复制 Prompt"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          贴给 Cursor / Claude 等，按你 App 的设计自己写列表 UI。不是强制组件，但曝光和点击必须按规则上报。
        </p>
        <ActionStatus error={copyPrompt.error} />
        <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs leading-5">
          {prompt}
        </pre>
      </section>
    </div>
  );
}

function buildIntegratePrompt({
  appId,
  appName,
  platforms,
  sample,
}: {
  appId: string;
  appName: string;
  platforms: { platform: Platform; packageName: string }[];
  sample: unknown;
}) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const platformList =
    platforms.length === 0
      ? "尚未配置平台，请先在控制台勾选端并填写包名"
      : platforms.map((p) => `${PLATFORM_LABELS[p.platform]}（${p.platform}，包名 ${p.packageName}）`).join("、");
  const sampleBlock = sample
    ? `\n## 一份真实返回示例\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n`
    : "";

  return `你是资深移动端工程师。请为「${appName}」接入 AppUnions 应用互推，按本 App 现有设计风格自己写 UI，不要做成广告后台。

## 目标
在客户端内做一块推荐列表：卡片展示其他应用，用户可以换一批、查看全部，并在真实可见/点击时上报事件。

## 凭证
- Base URL：${origin}
- app_id：${appId}
- 鉴权头：Authorization: Bearer <保存在本地安全存储的 api_key>
- 不要把 api_key 写进源码或仓库
- 当前已配置的端：${platformList}
- 请求时 platform 必须是当前运行端：android / ios / harmonyos

## 接口
1. GET /v1/apps/recommend?platform=<当前端>&limit=10
   从推荐池等权随机，最多 10 条，不含自己。
2. GET /v1/apps?platform=<当前端>&page=1&page_size=20
   全量已通过且未暂停、且配置了该端的应用。page 从 1，page_size 默认 20，最大 50。
3. POST /v1/events/impressions
   卡片进入可视区域后再报。visible 必须为 true。单次最多 10 条。
4. POST /v1/events/clicks
   用户点击后再报，然后用返回的 package_name 打开对应应用商店。

列表项字段：id, name, icon_url, tagline, category, subcategory, platform, package_name。

曝光请求体：
{ "platform": "android", "client_id": "<设备持久化 UUID>", "impressions": [{ "app_id": "<id>", "idempotency_key": "<UUID>", "visible": true }] }

点击请求体：
{ "platform": "android", "client_id": "<同一 UUID>", "app_id": "<id>", "idempotency_key": "<UUID>" }

## UI 要求
- 每张卡片：图标、名称、一句话（tagline）、操作按钮
- 「换一批」再次请求 recommend
- 「查看全部」走分页 list
- 打开商店：Android 用 market://details?id=<package_name>；iOS / 鸿蒙用返回的 package_name 打开对应应用市场
- 不是强制组件，但曝光、点击必须按规则上报，禁止一进页就批量报曝光

## 规则
- 同端互推，未配置的端不要请求
- 审核通过前正式 /v1 会返回 403 app_not_approved
- 推荐池有观察期和互惠门槛，以后台显示为准
- 常见错误：401 unauthorized、403 app_not_approved / app_paused_by_ops、429 rate_limited
${sampleBlock}`;
}
