import { Link, Outlet } from "react-router-dom";
import { RecommendListPanel } from "../shared/recommend-list-panel";

export function DocsLayout() {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[180px_1fr] gap-8 px-6 py-10">
      <nav className="text-sm">
        <Link className="block py-1" to="/docs">
          接入步骤
        </Link>
        <Link className="block py-1" to="/docs/api">
          API
        </Link>
        <Link className="block py-1" to="/docs/rules">
          规则
        </Link>
        <Link className="block py-1" to="/docs/ui">
          样式参考
        </Link>
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
        <li>保存一次性展示的 API Key，离开后无法再看明文。</li>
        <li>等待运营审核。通过前调用开放接口会返回未通过。</li>
        <li>
          用 <code>Authorization: Bearer &lt;api_key&gt;</code> 调 <code>GET /v1/apps/recommend?platform=android</code>
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
      <p className="text-sm">Base URL 与网站同域。只给宿主 App 用，不要在浏览器控制台里拿 Key 试（会计入统计）。</p>
      <h2 className="mt-6 font-medium">鉴权</h2>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">Authorization: Bearer auk_live_...</pre>
      <h2 className="mt-6 font-medium">GET /v1/apps/recommend</h2>
      <p className="text-sm">
        Query：<code>platform</code>（必填，android / ios / harmonyos）。同端、排除自己、仅推荐池，等权随机。返回条数由控制台「配置」决定（1–10）。宿主必须已配置该端。「换一批」再请求一次。
      </p>
      <p className="text-sm">
        每条返回 <code>id, name, icon_url, tagline, category, subcategory, platform, package_name</code>。客户端用包名打开商店，例如 Android{" "}
        <code>market://details?id=&lt;package_name&gt;</code>。
      </p>
      <h2 className="mt-6 font-medium">POST /v1/events/impressions</h2>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`{
  "platform": "android",
  "client_id": "uuid",
  "impressions": [
    { "app_id": "uuid", "idempotency_key": "uuid", "visible": true }
  ]
}`}</pre>
      <p className="text-sm">client_id 为设备上持久化的匿名 UUID。visible 必须为 true。单次最多 10 条。</p>
      <h2 className="mt-6 font-medium">POST /v1/events/clicks</h2>
      <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`{
  "platform": "android",
  "client_id": "uuid",
  "app_id": "uuid",
  "idempotency_key": "uuid"
}`}</pre>
      <h2 className="mt-6 font-medium">错误码</h2>
      <ul className="list-disc pl-5 text-sm">
        <li>401 unauthorized：Key 无效或已重置</li>
        <li>403 app_not_approved / app_paused_by_ops</li>
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
