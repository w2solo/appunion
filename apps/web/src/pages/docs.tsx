import { Link, Outlet } from "react-router-dom";

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
        <li>保存一次性展示的 API Key，离开后无法再看明文。</li>
        <li>等待运营审核。通过前调用开放接口会返回未通过。</li>
        <li>
          用 <code>Authorization: Bearer &lt;api_key&gt;</code> 调 <code>GET /v1/apps/recommend?platform=android</code>
          （换成当前端），最多 10 条。
        </li>
        <li>卡片进入可视区域后再报曝光；用户点击后再报点击，然后用返回的 <code>package_name</code> 打开对应应用商店。</li>
        <li>「换一批」再次请求 recommend；「查看全部」走 <code>GET /v1/apps</code> 分页。</li>
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
        Query：<code>platform</code>（必填，android / ios / harmonyos）、<code>limit</code> 默认 10，最大 10。同端、排除自己、仅推荐池，等权随机。宿主必须已配置该端。
      </p>
      <h2 className="mt-6 font-medium">GET /v1/apps</h2>
      <p className="text-sm">
        全量已通过且未暂停、且配置了该端的 App。必填 <code>platform</code>。page 从 1，page_size 默认 20，最大 50。
      </p>
      <p className="text-sm">
        每条返回 <code>id, name, icon_url, tagline, category, platform, package_name</code>。客户端用包名打开商店，例如 Android{" "}
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
        <li>推荐和全量列表都不包含你自己。</li>
        <li>审核通过后有观察期（默认 7 天），期间可以被抽中。</li>
        <li>之后滚动 7 天有效贡献曝光需达到门槛（默认 100），否则离开推荐池，但仍出现在全量列表。</li>
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
        不是强制组件。你可以按自己 App 的风格来画，但必须上报曝光和点击。建议卡片包含：图标、名称、一句话、操作按钮。
      </p>
      <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-line bg-slate-50 p-4">
        <div className="mb-3 text-center text-sm text-muted">推荐</div>
        {[1, 2, 3].map((n) => (
          <div key={n} className="mb-3 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
            <div className="h-12 w-12 rounded-xl bg-slate-200" />
            <div className="flex-1">
              <div className="font-medium">示例应用 {n}</div>
              <div className="text-xs text-muted">一句话介绍不超过三十个字</div>
            </div>
            <button className="rounded-full bg-brand px-3 py-1 text-xs text-white">查看</button>
          </div>
        ))}
        <div className="mt-4 flex justify-between text-sm text-brand">
          <span>换一批</span>
          <span>查看全部</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">换一批 → GET /v1/apps/recommend?platform=…；查看全部 → GET /v1/apps?platform=…。</p>
    </>
  );
}
