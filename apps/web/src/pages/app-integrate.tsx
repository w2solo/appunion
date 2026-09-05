import { useEffect, useMemo, useState } from "react";
import { IMPRESSION_BATCH_MAX, PLATFORMS, PLATFORM_LABELS, type Platform } from "@appunions/shared";
import { api } from "../shared/api";
import { ActionStatus, copyToClipboard, useActionFeedback } from "../shared/action-status";
import { RecommendListPanel } from "../shared/recommend-list-panel";

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

export function AppIntegratePanel({
  appId,
  appName,
  platforms,
  listSize,
}: {
  appId: string;
  appName: string;
  platforms: { platform: Platform; packageName: string }[];
  listSize: number;
}) {
  const [platform, setPlatform] = useState<Platform>(platforms[0]?.platform ?? "android");
  const [result, setResult] = useState<unknown>(null);
  const copyPrompt = useActionFeedback();
  const copyCurl = useActionFeedback();
  const send = useActionFeedback();

  useEffect(() => {
    if (platforms.length > 0 && !platforms.some((p) => p.platform === platform)) {
      setPlatform(platforms[0]!.platform);
    }
  }, [platforms, platform]);

  const v1Path = `/v1/apps/recommend?platform=${platform}`;
  const curl = `curl -s '${window.location.origin}${v1Path}' \\\n  -H 'Authorization: Bearer <你的密钥>'`;

  const items = useMemo(() => {
    if (!result || typeof result !== "object" || !("items" in result)) return [];
    return Array.isArray((result as { items: unknown }).items)
      ? ((result as { items: ListingItem[] }).items ?? [])
      : [];
  }, [result]);

  async function run() {
    await send.run(async () => {
      const data = await api(`/dashboard/apps/${appId}/preview/recommend?platform=${platform}`);
      setResult(data);
    }, "已返回结果");
  }

  const prompt = buildIntegratePrompt({
    appId,
    appName,
    platforms,
    listSize,
    sample: result,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">列表面板预览</h2>
        <p className="mt-1 text-sm text-muted">
          客户端只做这一块内嵌列表，条数以「配置」为准（当前 {listSize} 条）。后台预览不消耗 API Key，也不计入曝光和点击。点「换一批」会重新随机抽取。
        </p>
        {platforms.length === 0 && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            请先在「基本信息」里至少配置一个平台，才能按端拉取列表。
          </p>
        )}
        <label className="mt-4 block max-w-xs text-sm">
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
        <div className="mx-auto mt-5 max-w-[360px]">
          <RecommendListPanel
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              iconUrl: item.icon_url,
              tagline: item.tagline,
            }))}
            shuffling={send.busy}
            emptyText={result == null ? "点换一批查看真实返回" : "暂时没有可展示的应用"}
            onShuffle={platforms.length === 0 ? undefined : () => void run()}
          />
        </div>
        <div className="mt-3 flex justify-center">
          <ActionStatus error={send.error} message={send.message} />
        </div>
        <div className="mt-5">
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
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted">返回 JSON</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-100 p-3 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
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
          贴给 Cursor / Claude 等，按你 App 的设计做一块内嵌列表面板。不要做全量页面。
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
  listSize,
  sample,
}: {
  appId: string;
  appName: string;
  platforms: { platform: Platform; packageName: string }[];
  listSize: number;
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

  return `你是资深移动端工程师。请为「${appName}」接入 AppUnions 应用互推。

## 只做一块内嵌列表面板
不要做独立「全部应用」页面，不要分页，不要调用 GET /v1/apps。用户只在当前页看到这一块列表，点「换一批」重新随机抽取。

视觉参考系统原生分组列表（iOS Settings / 类似 inset grouped）：
- 浅灰底上的白色圆角卡片
- 标题「发现应用」，右侧「换一批」
- 每行：圆角图标、名称、一句话 tagline、右侧「打开」
- 行与行之间细分割线
- 按本 App 现有字体、间距和主色微调，不要做成广告横幅

## 条数
控制台已把列表条数配成 ${listSize}。GET /v1/apps/recommend 会按这个数量返回，客户端不要再截断、也不要再传更大的 limit。

## 凭证
- Base URL：${origin}
- app_id：${appId}
- 鉴权头：Authorization: Bearer <保存在本地安全存储的 api_key>
- 不要把 api_key 写进源码或仓库
- 当前已配置的端：${platformList}
- 请求时 platform 必须是当前运行端：android / ios / harmonyos

## 接口
1. GET /v1/apps/recommend?platform=<当前端>
   从推荐池等权随机，返回 ${listSize} 条，不含自己。换一批 = 再请求一次。
2. POST /v1/events/impressions
   卡片进入可视区域后再报。visible 必须为 true。单次最多 ${IMPRESSION_BATCH_MAX} 条。
3. POST /v1/events/clicks
   用户点击后再报，然后用返回的 package_name 打开对应应用商店。

列表项字段：id, name, icon_url, tagline, category, subcategory, platform, package_name。

曝光请求体：
{ "platform": "android", "client_id": "<设备持久化 UUID>", "impressions": [{ "app_id": "<id>", "idempotency_key": "<UUID>", "visible": true }] }

点击请求体：
{ "platform": "android", "client_id": "<同一 UUID>", "app_id": "<id>", "idempotency_key": "<UUID>" }

打开商店：Android 用 market://details?id=<package_name>；iOS / 鸿蒙用返回的 package_name 打开对应应用市场。禁止一进页就批量报曝光。

## 规则
- 同端互推，未配置的端不要请求
- 审核通过前正式 /v1 会返回 403 app_not_approved
- 推荐池有观察期和互惠门槛，以后台显示为准
- 常见错误：401 unauthorized、403 app_not_approved / app_paused_by_ops、429 rate_limited
${sampleBlock}`;
}
