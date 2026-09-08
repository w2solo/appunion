import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ActionStatus, useActionFeedback } from "../shared/action-status";
import { api } from "../shared/api";
import { useAuth } from "../shared/auth";
import { platformLabel, statusLabel } from "../shared/status";
import { ANDROID_STORE_LABELS, isAndroidStore } from "@appunions/shared";
import { SuggestInput } from "../shared/category-fields";

type AdminApp = {
  id: string;
  name: string;
  iconUrl: string;
  platforms: {
    platform: string;
    packageName: string;
    downloadStores?: string[];
    extraDownloads?: { label: string; url: string }[];
  }[];
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  inRecommendPool: boolean;
  developerEmail: string;
  tagline: string;
  description?: string;
  category: string;
  subcategory: string;
  rejectedReason: string | null;
  createdAt: string;
  reviews?: { id: string; action: string; reason: string | null; createdAt: string }[];
};

export function OpsReviewPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";
  const [items, setItems] = useState<AdminApp[]>([]);

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    api<{ items: AdminApp[] }>(`/admin/apps${q}`).then((d) => setItems(d.items));
  }, [status]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">审核</h1>
      <div className="my-4 flex gap-3 text-sm">
        {["pending", "approved", "rejected", "ops_paused"].map((s) => (
          <button key={s} className={status === s ? "font-semibold" : "text-muted"} onClick={() => setParams({ status: s })}>
            {s === "pending" ? "待审" : s === "approved" ? "已通过" : s === "rejected" ? "已拒绝" : "运营暂停"}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-muted">没有待审应用</p>
      ) : (
        <table className="w-full rounded-lg bg-white text-left text-sm shadow-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3">应用</th>
              <th className="px-4 py-3">端</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">开发者</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((app) => (
              <tr key={app.id} className="border-t border-line">
                <td className="px-4 py-3">{app.name}</td>
                <td className="px-4 py-3">
                  {app.platforms.length === 0
                    ? "未配置"
                    : app.platforms.map((p) => platformLabel(p.platform)).join(" / ")}
                </td>
                <td className="px-4 py-3">
                  {app.category}
                  {app.subcategory ? ` / ${app.subcategory}` : ""}
                </td>
                <td className="px-4 py-3">{app.developerEmail}</td>
                <td className="px-4 py-3 text-right">
                  <Link className="text-brand" to={`/ops/apps/${app.id}`}>
                    审核
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function OpsAppPage() {
  const { id } = useParams();
  const [app, setApp] = useState<AdminApp | null>(null);
  const [reason, setReason] = useState("");
  const [loadError, setLoadError] = useState("");
  const action = useActionFeedback();

  function load() {
    return api<AdminApp>(`/admin/apps/${id}`).then(setApp);
  }

  useEffect(() => {
    load().catch((e: Error) => setLoadError(e.message));
  }, [id]);

  async function act(path: string, success: string, body?: object) {
    await action.run(async () => {
      await api(`/admin/apps/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    }, success);
  }

  if (loadError) return <p className="text-red-600">{loadError}</p>;
  if (!app) return <p className="text-muted">加载中…</p>;
  const s = statusLabel(app);

  return (
    <div className="space-y-4">
      <Link className="text-sm text-brand" to="/ops/review">
        返回队列
      </Link>
      <div className="flex items-center gap-4">
        <img src={app.iconUrl} alt="" className="h-16 w-16 rounded" />
        <div>
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <p className="text-sm text-muted">
            {(app.platforms.length === 0
              ? "未配置平台"
              : app.platforms.map((p) => platformLabel(p.platform)).join(" / "))}{" "}
            · {app.developerEmail}
          </p>
          <p className="text-sm text-muted">
            {app.category}
            {app.subcategory ? ` / ${app.subcategory}` : ""}
          </p>
          <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
        </div>
      </div>
      <p>{app.tagline}</p>
      {app.description ? <p className="whitespace-pre-wrap text-sm text-slate-700">{app.description}</p> : null}
      {app.platforms.length === 0 ? (
        <p className="text-sm text-amber-800">尚未配置平台和包名。</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {app.platforms.map((p) => (
            <li key={p.platform}>
              <div>
                {platformLabel(p.platform)}：<code className="rounded bg-slate-100 px-1">{p.packageName}</code>
              </div>
              {p.platform === "android" && (
                <div className="mt-1 space-y-1 text-muted">
                  <p>
                    下载平台：
                    {(p.downloadStores ?? []).filter(isAndroidStore).length === 0
                      ? "未选（走系统应用商店）"
                      : (p.downloadStores ?? [])
                          .filter(isAndroidStore)
                          .map((store) => ANDROID_STORE_LABELS[store])
                          .join("、")}
                  </p>
                  {(p.extraDownloads ?? []).length > 0 && (
                    <p>
                      额外下载：
                      {(p.extraDownloads ?? []).slice(0, 1).map((item) => (
                        <a key={item.url} className="text-brand" href={item.url} rel="noreferrer" target="_blank">
                          {item.label} {item.url}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={action.busy}
          type="button"
          onClick={() => void act("approve", "已通过")}
        >
          {action.busy ? "处理中…" : "通过"}
        </button>
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!reason.trim()) return;
            void act("reject", "已拒绝", { reason });
          }}
        >
          <input
            className="rounded border border-line px-2"
            placeholder="拒绝原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={action.busy}>
            拒绝
          </button>
        </form>
        <button
          className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
          disabled={action.busy}
          type="button"
          onClick={() => {
            const r = prompt("暂停原因");
            if (!r) return;
            void act("pause", "已暂停", { reason: r });
          }}
        >
          运营暂停
        </button>
        <button
          className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
          disabled={action.busy}
          type="button"
          onClick={() => void act("resume", "已恢复")}
        >
          恢复
        </button>
        <ActionStatus error={action.error} message={action.message} />
      </div>
      {app.reviews && app.reviews.length > 0 && (
        <ul className="text-sm text-muted">
          {app.reviews.map((r) => (
            <li key={r.id}>
              {r.action} {r.reason ?? ""} · {new Date(r.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpsAnomaliesPage() {
  const [items, setItems] = useState<{ id: string; appId: string; appName: string; type: string; window: string; createdAt: string }[]>(
    [],
  );
  useEffect(() => {
    api<{ items: typeof items }>("/admin/anomalies").then((d) => setItems(d.items));
  }, []);
  return (
    <div>
      <h1 className="text-2xl font-semibold">异常 CTR</h1>
      <p className="mt-2 text-sm text-muted">不会自动封禁，请到审核详情决定是否暂停。</p>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="rounded bg-white p-3 shadow-sm">
            <Link className="text-brand" to={`/ops/apps/${i.appId}`}>
              {i.appName}
            </Link>{" "}
            · {i.type} · {i.window} · {new Date(i.createdAt).toLocaleString()}
          </li>
        ))}
        {items.length === 0 && <li className="text-muted">暂无异常</li>}
      </ul>
    </div>
  );
}

export function OpsConfigPage() {
  const [cfg, setCfg] = useState<OpsConfig | null>(null);
  const save = useActionFeedback();
  const brand = useActionFeedback();
  const logo = useActionFeedback();

  useEffect(() => {
    api<OpsConfig>("/admin/config").then(setCfg);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("观察天数或互惠门槛若有改动，会立刻重算推荐池。确定保存？")) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, number> = {};
    for (const [k, v] of fd.entries()) body[k] = Number(v);
    await save.run(async () => {
      const updated = await api<OpsConfig>("/admin/config", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setCfg(updated);
    }, "已保存");
  }

  async function onBrandSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await brand.run(async () => {
      const updated = await api<OpsConfig>("/admin/config", {
        method: "PATCH",
        body: JSON.stringify({
          unionName: String(fd.get("unionName") ?? "").trim(),
          unionSubtitle: String(fd.get("unionSubtitle") ?? "").trim(),
        }),
      });
      setCfg(updated);
    }, "已保存对外展示");
  }

  async function onLogoChange(file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.set("logo", file);
    await logo.run(async () => {
      const updated = await api<OpsConfig>("/admin/config/logo", { method: "POST", body: data });
      setCfg(updated);
    }, "已更新 logo");
  }

  if (!cfg) return <p className="text-muted">加载中…</p>;

  const fields: [NumericConfigKey, string][] = [
    ["graceDays", "观察天数"],
    ["reciprocityImpressions", "互惠曝光门槛"],
    ["impressionDedupMinutes", "曝光去重分钟"],
    ["recommendCacheSeconds", "推荐池缓存秒"],
    ["rateRecommendPerMin", "recommend 每分钟"],
    ["rateListPerMin", "list 每分钟"],
    ["rateInfoPerMin", "info 每分钟"],
    ["rateImpressionsPerMin", "曝光每分钟条数"],
    ["rateClicksPerMin", "点击每分钟"],
  ];

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">设置</h1>
      <section className="space-y-2 rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium">超级管理员</h2>
        <p className="text-sm text-muted">由环境变量 SUPER_ADMIN_EMAIL 指定，不能在页面里改。</p>
        <p className="rounded border border-line bg-slate-50 px-3 py-2 text-sm">
          {cfg.superAdminEmail || "未配置"}
        </p>
      </section>
      <form className="space-y-3 rounded-lg bg-white p-6 shadow-sm" onSubmit={(e) => void onBrandSubmit(e)}>
        <h2 className="font-medium">对外展示</h2>
        <p className="text-sm text-muted">客户端通过 GET /v1/info 拿到名称、宣传语和 logo，用来画互推入口。</p>
        <label className="block text-sm">
          对外名称
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            defaultValue={cfg.unionName}
            key={`name-${cfg.unionName}`}
            name="unionName"
            required
          />
        </label>
        <label className="block text-sm">
          宣传语
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            defaultValue={cfg.unionSubtitle}
            key={`subtitle-${cfg.unionSubtitle}`}
            name="unionSubtitle"
            required
          />
        </label>
        <div className="text-sm">
          品牌 logo（png/jpeg/webp，≤512KB）
          <div className="mt-2 flex items-center gap-3">
            {cfg.unionLogoUrl ? (
              <img src={cfg.unionLogoUrl} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-xs text-muted">
                未上传
              </div>
            )}
            <input
              accept="image/png,image/jpeg,image/webp"
              className="block text-sm"
              type="file"
              onChange={(e) => void onLogoChange(e.target.files?.[0])}
            />
          </div>
          <div className="mt-1">
            <ActionStatus error={logo.error} message={logo.message} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={brand.busy} type="submit">
            {brand.busy ? "保存中…" : "保存文案"}
          </button>
          <ActionStatus error={brand.error} message={brand.message} />
        </div>
      </form>
      <form className="space-y-3 rounded-lg bg-white p-6 shadow-sm" onSubmit={(e) => void onSubmit(e)}>
        <h2 className="font-medium">门槛参数</h2>
        {fields.map(([k, label]) => (
          <label key={k} className="block text-sm">
            {label}
            <input className="mt-1 w-full rounded border border-line px-3 py-2" name={k} type="number" defaultValue={cfg[k]} />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={save.busy}>
            {save.busy ? "保存中…" : "保存参数"}
          </button>
          <ActionStatus error={save.error} message={save.message} />
        </div>
      </form>
    </div>
  );
}

type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "developer";
  superAdmin: boolean;
};

export function OpsAdminsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(search = q) {
    setError("");
    const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const data = await api<{ items: AdminUser[] }>(`/admin/users${query}`);
    setItems(data.items);
  }

  useEffect(() => {
    void load("").catch((e: Error) => setError(e.message));
  }, []);

  async function setRole(user: AdminUser, role: "admin" | "developer") {
    const next = role === "admin" ? "设为普通管理员" : "取消管理员";
    if (!confirm(`确定将 ${user.email} ${next}？`)) return;
    setBusyId(user.id);
    setError("");
    setMessage("");
    try {
      const updated = await api<AdminUser>(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setItems((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setMessage(role === "admin" ? `已将 ${user.email} 设为管理员` : "已取消管理员");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">管理员</h1>
      <p className="text-sm text-muted">
        当前超级管理员是 <code className="rounded bg-slate-100 px-1">{user?.superAdminEmail || "未配置"}</code>
        ，由环境变量 SUPER_ADMIN_EMAIL 指定。只能把已经注册过的用户标成普通管理员；对方刷新页面或重新登录后即可看到审核台。普通管理员可以审核应用、改门槛参数，但不能再管理管理员。
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load().catch((err: Error) => setError(err.message));
        }}
      >
        <input
          className="flex-1 rounded border border-line px-3 py-2 text-sm"
          placeholder="搜索已注册邮箱"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="rounded bg-brand px-4 py-2 text-sm text-white" type="submit">
          搜索
        </button>
      </form>
      <ActionStatus error={error} message={message} />
      {items.length === 0 ? (
        <p className="text-muted">没有找到已注册用户</p>
      ) : (
        <table className="w-full rounded-lg bg-white text-left text-sm shadow-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">角色</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  {user.superAdmin ? "超级管理员" : user.role === "admin" ? "普通管理员" : "开发者"}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.superAdmin ? (
                    <span className="text-muted">固定</span>
                  ) : user.role === "admin" ? (
                    <button
                      className="text-red-700 disabled:text-muted"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user, "developer")}
                      type="button"
                    >
                      取消管理员
                    </button>
                  ) : (
                    <button
                      className="text-brand disabled:text-muted"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user, "admin")}
                      type="button"
                    >
                      设为管理员
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type OpsConfig = {
  graceDays: number;
  reciprocityImpressions: number;
  impressionDedupMinutes: number;
  recommendCacheSeconds: number;
  rateRecommendPerMin: number;
  rateListPerMin: number;
  rateInfoPerMin: number;
  rateImpressionsPerMin: number;
  rateClicksPerMin: number;
  unionName: string;
  unionSubtitle: string;
  unionLogoUrl: string;
  superAdminEmail: string;
};

type NumericConfigKey = Exclude<
  keyof OpsConfig,
  "superAdminEmail" | "unionName" | "unionSubtitle" | "unionLogoUrl"
>;

type CategoryNode = { id: string; name: string; appCount: number; children: { id: string; name: string; appCount: number }[] };

export function OpsCategoriesPage() {
  const [items, setItems] = useState<CategoryNode[]>([]);
  const [loadError, setLoadError] = useState("");
  const [parentDraft, setParentDraft] = useState("");
  const [childDrafts, setChildDrafts] = useState<Record<string, string>>({});
  const action = useActionFeedback();

  async function load() {
    const data = await api<{ items: CategoryNode[] }>("/admin/categories");
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((e: Error) => setLoadError(e.message));
  }, []);

  async function addParent() {
    await action.run(async () => {
      await api("/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name: parentDraft, parentId: null }),
      });
      setParentDraft("");
      await load();
    }, "已添加大分类");
  }

  async function addChild(parentId: string) {
    const name = (childDrafts[parentId] ?? "").trim();
    if (!name) return;
    await action.run(async () => {
      await api("/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name, parentId }),
      });
      setChildDrafts((prev) => ({ ...prev, [parentId]: "" }));
      await load();
    }, "已添加小分类");
  }

  async function rename(id: string, name: string) {
    await action.run(async () => {
      await api(`/admin/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await load();
    }, "已保存");
  }

  async function remove(id: string) {
    if (!confirm("确定删除这个分类？")) return;
    await action.run(async () => {
      await api(`/admin/categories/${id}`, { method: "DELETE" });
      await load();
    }, "已删除");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">分类</h1>
      <p className="text-sm text-muted">
        大分类下再分小分类。点输入框会提示已有名称，也可以直接输入新的。开发者创建应用时同样可以选已有或输入新分类。
      </p>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      <ActionStatus error={action.error} message={action.message} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addParent();
        }}
      >
        <div className="flex-1">
          <SuggestInput
            value={parentDraft}
            options={items.map((i) => i.name)}
            placeholder="新增大分类"
            onChange={setParentDraft}
          />
        </div>
        <button className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50" disabled={action.busy} type="submit">
          {action.busy ? "处理中…" : "添加大分类"}
        </button>
      </form>
      <div className="space-y-3">
        {items.map((group) => (
          <section key={group.id} className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded border border-line px-3 py-1.5 text-sm font-medium"
                defaultValue={group.name}
                key={group.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== group.name) void rename(group.id, next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="text-xs text-muted">{group.appCount} 个应用</span>
              <button className="text-sm text-red-700" type="button" onClick={() => void remove(group.id)}>
                删除
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {group.children.map((child) => (
                <li key={child.id} className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded border border-line px-3 py-1.5 text-sm"
                    defaultValue={child.name}
                    key={child.name}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== child.name) void rename(child.id, next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <span className="text-xs text-muted">{child.appCount}</span>
                  <button className="text-sm text-red-700" type="button" onClick={() => void remove(child.id)}>
                    删除
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addChild(group.id);
              }}
            >
              <div className="flex-1">
                <SuggestInput
                  value={childDrafts[group.id] ?? ""}
                  options={group.children.map((c) => c.name)}
                  placeholder="新增小分类"
                  onChange={(value) => setChildDrafts((prev) => ({ ...prev, [group.id]: value }))}
                />
              </div>
              <button className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50" disabled={action.busy} type="submit">
                添加
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
