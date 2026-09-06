import { useEffect, useState } from "react";
import {
  IMPRESSION_BATCH_MAX,
  PLATFORM_LABELS,
  PLATFORMS,
  type ListingItem,
  type Platform,
} from "@appunions/shared";
import { api } from "../shared/api";
import { ActionStatus, copyToClipboard, useActionFeedback } from "../shared/action-status";
import { RecommendListPanel } from "../shared/recommend-list-panel";

type RecommendResponse = {
  items: ListingItem[];
  mock?: boolean;
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
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const copyPrompt = useActionFeedback();
  const copyCurl = useActionFeedback();
  const copyId = useActionFeedback();
  const send = useActionFeedback();

  useEffect(() => {
    if (platforms.length > 0 && !platforms.some((p) => p.platform === platform)) {
      setPlatform(platforms[0]!.platform);
    }
  }, [platforms, platform]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const v1Path = `/v1/apps/recommend?app_id=${appId}&platform=${platform}`;
  const curl = `curl -s '${origin}${v1Path}'`;

  async function run(openModal: boolean) {
    await send.run(async () => {
      const data = await api<RecommendResponse>(v1Path);
      setResult(data);
      if (openModal) setOpen(true);
    }, "已返回列表");
  }

  const prompt = buildIntegratePrompt({
    appId,
    appName,
    platforms,
    listSize,
    origin,
    sample: result,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">把互推接到这个 App</h2>
        <p className="mt-1 text-sm text-muted">
          这篇文档只针对当前应用。原生客户端直接调开放接口，只需 <code>app_id</code>，不需要 API Key，也不需要自建后端。
        </p>
        <p className="mt-4 text-sm">
          app_id：<code className="rounded bg-slate-100 px-1">{appId}</code>
          <button
            className="ml-2 text-brand"
            type="button"
            onClick={() => void copyId.run(() => copyToClipboard(appId), "已复制")}
          >
            {copyId.message ? "已复制" : "复制"}
          </button>
          {copyId.error && <span className="ml-2 text-red-600">{copyId.error}</span>}
        </p>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">交互规范</h2>
        <p className="mt-1 text-sm text-muted">
          只做一块内嵌列表面板，不要做「查看全部」或全量列表页。按系统原生分组列表来画，并按你 App 的字体和主色微调。
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7">
          <li>列表每行：圆角图标、名称、简介（<code>tagline</code>）、右侧「查看」。</li>
          <li>用户点整行后弹出应用详情：图标、名称、简介、更多描述（<code>description</code>）、支持的平台、下载渠道。</li>
          <li>
            Android：按返回的 <code>downloads</code> 展示按钮，点哪个就打开哪条 <code>url</code>（商店 scheme 或 https）。不要自己拼商店地址。
          </li>
          <li>iOS / 鸿蒙：详情里用「打开 App Store / 鸿蒙应用市场」；<code>downloads[].url</code> 为空时，用 <code>package_name</code> 打开对应商店。</li>
          <li>卡片进入可视区域后再报曝光。点开详情不算点击；用户在详情里点某个下载按钮后再报点击，然后跳转。</li>
          <li>「换一批」再次请求 recommend。条数以「配置」为准（当前 {listSize} 条）。</li>
        </ol>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">请求与测试</h2>
        <p className="mt-1 text-sm text-muted">
          条数以「配置」为准（当前 {listSize} 条）。审核中返回 mock（根上 <code>mock: true</code>），不计曝光；通过后自动变为真实推荐。
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={send.busy || platforms.length === 0}
            type="button"
            onClick={() => void run(true)}
          >
            {send.busy ? "拉取中…" : "点击测试"}
          </button>
          <ActionStatus error={send.error} message={open ? "" : send.message} />
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
        <div className="mt-6 border-t border-line pt-4 text-sm">
          <h3 className="font-medium">曝光与点击</h3>
          <p className="mt-1 text-muted">
            查询参数 <code>app_id</code> 是你的应用；请求体里的 <code>app_id</code> 是列表里被展示/下载的应用。后台测试不代发上报。
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`POST /v1/events/impressions?app_id=${appId}
{
  "platform": "${platform}",
  "client_id": "<设备上持久化的 UUID>",
  "impressions": [
    { "app_id": "<列表里的 id>", "idempotency_key": "<UUID>", "visible": true }
  ]
}

POST /v1/events/clicks?app_id=${appId}
{
  "platform": "${platform}",
  "client_id": "<同一设备 UUID>",
  "app_id": "<被下载的 id>",
  "idempotency_key": "<UUID>"
}`}</pre>
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">接口字段</h2>
        <p className="mt-1 text-sm text-muted">
          <code>GET /v1/apps/recommend?app_id=…&amp;platform={platform}</code> 每条包含：
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
          <li>
            <code>id, name, icon_url, tagline, description, category, subcategory, platform, package_name</code>
          </li>
          <li>
            <code>supported_platforms</code>：该应用已配置的系统端，详情里用来展示「也支持 iOS」等。
          </li>
          <li>
            <code>downloads</code>：当前请求端的下载按钮。Android 为商店 + 额外链接，每条都有 <code>kind / label / url</code>；点按钮直接打开{" "}
            <code>url</code>。iOS / 鸿蒙通常一条 <code>kind: "store"</code> 且 <code>url</code> 为空，改用{" "}
            <code>package_name</code>。
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          常见错误：401 unauthorized（app_id 无效）、403 app_not_approved（已拒绝）/ app_paused_by_ops、429 rate_limited。
        </p>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">规则摘要</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7">
          <li>同端互推：请求必须带当前端。Android 只出配置了 Android 的应用，iOS、鸿蒙同理。</li>
          <li>列表面板不含你自己。不要调用 GET /v1/apps 做全量页。</li>
          <li>审核中可用 app_id 拉 mock；上报会 accepted 但不记账。已拒绝才返回 403 app_not_approved。</li>
          <li>审核通过后有观察期（默认 7 天），之后滚动 7 天有效贡献曝光需达门槛（默认 100），否则暂时离开推荐池。</li>
          <li>开发者暂停：自己不出现在别人列表，开放接口仍可用。运营暂停：列表不可见且开放接口不可用。</li>
        </ul>
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
        <p className="mt-1 text-sm text-muted">贴给 Cursor / Claude 等，按你 App 的设计做一块内嵌列表和详情弹窗。</p>
        <ActionStatus error={copyPrompt.error} />
        <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs leading-5">
          {prompt}
        </pre>
      </section>

      {open && result && (
        <PreviewModal
          result={result}
          shuffling={send.busy}
          error={send.error}
          onClose={() => setOpen(false)}
          onShuffle={() => void run(false)}
        />
      )}
    </div>
  );
}

function PreviewModal({
  result,
  shuffling,
  error,
  onClose,
  onShuffle,
}: {
  result: RecommendResponse;
  shuffling: boolean;
  error: string;
  onClose: () => void;
  onShuffle: () => void;
}) {
  const mock = result.mock === true;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-[400px] overflow-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">列表面板预览</h3>
            <p
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                mock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {mock ? "测试数据（审核中）" : "真实推荐"}
            </p>
          </div>
          <button className="text-sm text-muted" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {mock
            ? "当前应用尚未通过审核，接口返回的是 mock，不计曝光。通过后这里会自动变成真实推荐。"
            : "当前返回的是真实推荐池。点列表项看详情弹窗，点「换一批」会再随机抽一次。"}
        </p>
        <div className="mx-auto mt-4 max-w-[360px]">
          <RecommendListPanel
            items={result.items.map((item) => ({
              id: item.id,
              name: item.name,
              iconUrl: item.icon_url,
              tagline: item.tagline,
              description: item.description,
              supportedPlatforms: item.supported_platforms,
              downloads: item.downloads,
              packageName: item.package_name,
              platform: item.platform,
            }))}
            shuffling={shuffling}
            emptyText="暂时没有可展示的应用"
            onShuffle={onShuffle}
          />
        </div>
        <div className="mt-3">
          <ActionStatus error={error} />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">返回 JSON</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-slate-100 p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function buildIntegratePrompt({
  appId,
  appName,
  platforms,
  listSize,
  origin,
  sample,
}: {
  appId: string;
  appName: string;
  platforms: { platform: Platform; packageName: string }[];
  listSize: number;
  origin: string;
  sample: unknown;
}) {
  const platformList =
    platforms.length === 0
      ? "尚未配置平台，请先在控制台勾选端并填写包名"
      : platforms.map((p) => `${PLATFORM_LABELS[p.platform]}（${p.platform}，包名 ${p.packageName}）`).join("、");
  const sampleBlock = sample
    ? `\n## 一份返回示例\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n`
    : "";

  return `你是资深移动端工程师。请为「${appName}」接入 AppUnions 应用互推。

## 只做一块内嵌列表面板 + 详情弹窗
不要做独立「全部应用」页面，不要分页，不要调用 GET /v1/apps。用户只在当前页看到这一块列表，点「换一批」重新随机抽取。

视觉参考系统原生分组列表（iOS Settings / 类似 inset grouped）：
- 浅灰底上的白色圆角卡片
- 标题「发现应用」，右侧「换一批」
- 每行：圆角图标、名称、一句话简介 tagline、右侧「查看」
- 点整行打开应用详情弹窗（不要直接跳商店）
- 详情：大图标、名称、简介、更多描述 description、支持的平台徽章、下载按钮列表
- 行与行之间细分割线
- 按本 App 现有字体、间距和主色微调，不要做成广告横幅

## 条数
控制台已把列表条数配成 ${listSize}。GET /v1/apps/recommend 会按这个数量返回，客户端不要再截断、也不要再传更大的 limit。

## 凭证
- Base URL：${origin}
- 只需要 app_id：${appId}
- 不要 API Key，不要自建后端转发。客户端直接请求开放接口
- 查询参数 app_id 是本应用 ID；曝光/点击请求体里的 app_id 是列表里被展示/下载的应用
- 当前已配置的端：${platformList}
- 请求时 platform 必须是当前运行端：android / ios / harmonyos

## 接口
1. GET /v1/apps/recommend?app_id=${appId}&platform=<当前端>
   从推荐池等权随机，返回 ${listSize} 条，不含自己。换一批 = 再请求一次。
2. POST /v1/events/impressions?app_id=${appId}
   卡片进入可视区域后再报。visible 必须为 true。单次最多 ${IMPRESSION_BATCH_MAX} 条。
3. POST /v1/events/clicks?app_id=${appId}
   用户在详情里点某个下载按钮后再报，然后跳转。点开详情本身不要报点击。

列表项字段：id, name, icon_url, tagline, description, category, subcategory, platform, package_name, supported_platforms, downloads。

downloads 每条：{ "kind": "store" | "url", "store"?: string, "label": string, "url": string }。
- Android：直接打开 downloads[].url（商店 scheme 或 https）。不要自己拼商店地址。若某端没有商店配置，服务端会给一条兜底「打开应用商店」。
- iOS / 鸿蒙：downloads 里通常一条 store，url 为空；用 package_name 打开对应应用市场。

曝光请求体：
{ "platform": "android", "client_id": "<设备持久化 UUID>", "impressions": [{ "app_id": "<列表里的 id>", "idempotency_key": "<UUID>", "visible": true }] }

点击请求体：
{ "platform": "android", "client_id": "<同一 UUID>", "app_id": "<列表里的 id>", "idempotency_key": "<UUID>" }

禁止一进页就批量报曝光。

## 规则
- 同端互推，未配置的端不要请求
- 审核中 /v1 返回结构相同的 mock 测试数据（根上可能有 mock: true），上报会 accepted 但不计曝光；通过后自动变为真实推荐。mock 包名打不开真商店
- 推荐池有观察期和互惠门槛，以后台显示为准
- 常见错误：401 unauthorized（app_id 无效）、403 app_not_approved（已拒绝）/ app_paused_by_ops、429 rate_limited
${sampleBlock}`;
}
