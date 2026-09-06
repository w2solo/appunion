import { NavLink, Outlet } from "react-router-dom";
import { IMPRESSION_BATCH_MAX, LIST_SIZE_MAX, LIST_SIZE_MIN } from "@appunions/shared";
import { RecommendListPanel } from "../shared/recommend-list-panel";

const TABS = [
  { to: "/docs", label: "接入步骤", end: true },
  { to: "/docs/api", label: "API" },
  { to: "/docs/rules", label: "规则" },
  { to: "/docs/ui", label: "样式参考" },
] as const;

export function DocsLayout() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">接入文档</h1>
      <nav className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={"end" in t ? t.end : false}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-4 py-2 text-sm ${
                isActive ? "border-brand font-medium text-brand" : "border-transparent text-muted"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <article className="prose-sm max-w-none space-y-4 rounded-lg bg-white p-8 shadow-sm">
        <Outlet />
      </article>
    </div>
  );
}

export function DocsIndex() {
  return (
    <>
      <h1 className="text-2xl font-semibold">接入步骤</h1>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-7">
        <li>用邮箱验证码登录（新邮箱会自动注册），然后创建应用（名称、描述、图标）。</li>
        <li>到应用详情勾选支持的平台，并填写对应包名（Android applicationId、iOS Bundle ID、鸿蒙 bundleName）。</li>
        <li>在「配置」里设置列表面板每次展示几条。</li>
        <li>到「接入」复制 <code>app_id</code>。客户端直接调开放接口，不需要 API Key，也不需要自建后端。</li>
        <li>
          等待运营审核。审核中用 <code>app_id</code> 调开放接口会返回测试 mock 数据（不计曝光）；通过后自动变为真实推荐。可在接入页点「点击测试」看效果。
        </li>
        <li>
          调 <code>GET /v1/apps/recommend?app_id=&lt;你的 app_id&gt;&amp;platform=android</code>
          （换成当前端）。条数以后台配置为准。
        </li>
        <li>卡片进入可视区域后再报曝光；用户点击后再报点击，然后用返回的 <code>package_name</code> 打开对应应用商店。</li>
        <li>「换一批」再次请求 recommend。不要做全量列表页。</li>
      </ol>
      <p className="text-sm text-muted">观察期和互惠门槛以后台显示为准，默认 7 天 / 100 次有效贡献曝光。</p>
    </>
  );
}

export function DocsApi() {
  return (
    <>
      <h1 className="text-2xl font-semibold">开放 API</h1>
      <p className="text-sm">
        Base URL 与网站同域。原生客户端直接调用，只需查询参数 <code>app_id</code>（你的应用 ID）。审核通过后不要用真实流量刷接口（会计入统计）；审核中返回的是 mock，上报不会记账。
      </p>
      <h2 className="mt-6 font-medium">鉴权</h2>
      <p className="text-sm">
        所有开放接口带查询参数 <code>app_id</code>。请求体里的 <code>app_id</code> 是列表里被展示/点击的目标应用，和宿主 ID 不是同一个字段。
      </p>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">GET /v1/apps/recommend?app_id=&lt;宿主 app_id&gt;&amp;platform=android</pre>
      <h2 className="mt-6 font-medium">GET /v1/apps/recommend</h2>
      <p className="text-sm">
        Query：<code>app_id</code>（必填，你的应用）、<code>platform</code>（必填，android / ios / harmonyos）。同端、排除自己、仅推荐池，等权随机。返回条数由控制台「配置」决定（{LIST_SIZE_MIN}–{LIST_SIZE_MAX}）。宿主必须已配置该端。「换一批」再请求一次。审核中返回结构相同的 mock 列表，根上带 <code>mock: true</code>；mock 包名打不开真商店。
      </p>
      <p className="text-sm">
        每条返回 <code>id, name, icon_url, tagline, category, subcategory, platform, package_name</code>。客户端用包名打开商店，例如 Android{" "}
        <code>market://details?id=&lt;package_name&gt;</code>。
      </p>
      <h2 className="mt-6 font-medium">POST /v1/events/impressions</h2>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`POST /v1/events/impressions?app_id=<宿主 app_id>
{
  "platform": "android",
  "client_id": "uuid",
  "impressions": [
    { "app_id": "uuid", "idempotency_key": "uuid", "visible": true }
  ]
}`}</pre>
      <p className="text-sm">
        client_id 为设备上持久化的匿名 UUID。visible 必须为 true。单次最多 {IMPRESSION_BATCH_MAX} 条。审核中对 mock id 会返回 accepted，但不计入统计。
      </p>
      <h2 className="mt-6 font-medium">POST /v1/events/clicks</h2>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`POST /v1/events/clicks?app_id=<宿主 app_id>
{
  "platform": "android",
  "client_id": "uuid",
  "app_id": "uuid",
  "idempotency_key": "uuid"
}`}</pre>
      <h2 className="mt-6 font-medium">错误码</h2>
      <ul className="list-disc pl-5 text-sm">
        <li>401 unauthorized：app_id 缺失或无效</li>
        <li>403 app_not_approved（已拒绝）/ app_paused_by_ops</li>
        <li>429 rate_limited</li>
      </ul>
    </>
  );
}

export function DocsRules() {
  return (
    <>
      <h1 className="text-2xl font-semibold">规则</h1>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-7">
        <li>同端互推：请求时必须带当前端的 <code>platform</code>。Android 只出配置了 Android 包名的应用，iOS、鸿蒙同理。</li>
        <li>列表面板不含你自己。</li>
        <li>审核中可用 app_id 拉 mock 测试数据，上报不计曝光；通过后自动变为真实推荐。已拒绝才返回 403 app_not_approved。</li>
        <li>审核通过后有观察期（默认 7 天），期间可以被抽中。</li>
        <li>之后滚动 7 天有效贡献曝光需达到门槛（默认 100），否则离开推荐池，别人的列表面板里暂时看不到你。</li>
        <li>开发者暂停：自己不出现在别人列表，开放接口仍可用。</li>
        <li>运营暂停：不出现在别人列表，且开放接口不可用。</li>
      </ul>
    </>
  );
}

export function DocsUi() {
  return (
    <>
      <h1 className="text-2xl font-semibold">样式参考</h1>
      <p className="text-sm">
        只做一块内嵌列表面板，不要做「查看全部」页面。按系统原生分组列表来画，并按你 App 的字体和主色微调。必须上报曝光和点击。
      </p>
      <div className="mx-auto mt-6 max-w-[360px]">
        <RecommendListPanel
          items={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
            id: String(n),
            name: `示例应用 ${n}`,
            tagline: "一句话介绍不超过三十个字",
          }))}
          onShuffle={() => undefined}
        />
      </div>
      <p className="mt-4 text-sm text-muted">换一批 → 再次请求 GET /v1/apps/recommend?platform=…。条数以后台「配置」为准。</p>
    </>
  );
}
