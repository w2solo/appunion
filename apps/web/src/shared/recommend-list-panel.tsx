import { useState } from "react";
import { PLATFORM_LABELS, type ListingDownload, type Platform } from "@appunions/shared";

export type RecommendPanelItem = {
  id: string;
  name: string;
  iconUrl?: string;
  tagline: string;
  description?: string;
  supportedPlatforms?: Platform[];
  downloads?: ListingDownload[];
  packageName?: string;
  platform?: Platform;
};

export type RecommendPanelBrand = {
  name: string;
  subtitle: string;
  logoUrl?: string;
  description?: string;
};

export function UnionEntryItem({
  branding,
  onClick,
  hint = "点击打开",
}: {
  branding: RecommendPanelBrand;
  onClick?: () => void;
  hint?: string;
}) {
  const inner = (
    <>
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-5">{branding.name}</div>
        {branding.subtitle ? (
          <div className="truncate text-[12px] leading-4 text-slate-500">{branding.subtitle}</div>
        ) : null}
      </div>
      <span className="shrink-0 text-[13px] text-slate-400">{hint}</span>
    </>
  );

  if (!onClick) {
    return <div className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left">{inner}</div>;
  }

  return (
    <button className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left" type="button" onClick={onClick}>
      {inner}
    </button>
  );
}

export function RecommendListPanel({
  items,
  branding,
  onShuffle,
  shuffling,
  emptyText = "暂时没有可展示的应用",
  onLoadDetail,
}: {
  items: RecommendPanelItem[];
  branding?: RecommendPanelBrand;
  onShuffle?: () => void;
  shuffling?: boolean;
  emptyText?: string;
  onLoadDetail?: (id: string) => Promise<RecommendPanelItem | null>;
}) {
  const [selected, setSelected] = useState<RecommendPanelItem | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const title = branding?.name || "发现应用";

  async function openItem(item: RecommendPanelItem) {
    if (!onLoadDetail) {
      setDetailError("");
      setSelected(item);
      return;
    }
    setLoadingId(item.id);
    setDetailError("");
    try {
      const detail = await onLoadDetail(item.id);
      if (detail) setSelected(detail);
      else setDetailError("无法加载详情");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "无法加载详情");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[22px] bg-[#f2f2f7] p-3">
      <div className="relative min-h-[420px] overflow-hidden rounded-[14px] bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold tracking-tight">{title}</div>
              {branding?.subtitle ? (
                <div className="truncate text-[11px] leading-4 text-slate-500">{branding.subtitle}</div>
              ) : null}
            </div>
          </div>
          {onShuffle && (
            <button
              className="shrink-0 text-[13px] font-medium text-blue-600 disabled:opacity-50"
              disabled={shuffling}
              type="button"
              onClick={() => {
                setSelected(null);
                setDetailError("");
                onShuffle();
              }}
            >
              {shuffling ? "换一批…" : "换一批"}
            </button>
          )}
        </div>
        {branding?.description ? (
          <p className="border-t border-black/[0.06] px-4 py-2.5 text-[12px] leading-5 text-slate-500">
            {branding.description}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="border-t border-black/[0.06] px-4 py-8 text-center text-[13px] text-slate-500">{emptyText}</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="border-t border-black/[0.06]">
                <button
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-60"
                  disabled={loadingId === item.id}
                  type="button"
                  onClick={() => void openItem(item)}
                >
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="h-11 w-11 rounded-[10px] object-cover" />
                  ) : (
                    <div className="h-11 w-11 rounded-[10px] bg-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium leading-5">{item.name}</div>
                    <div className="truncate text-[12px] leading-4 text-slate-500">{item.tagline}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] font-medium text-slate-800">
                    {loadingId === item.id ? "…" : "查看"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {detailError ? (
          <p className="border-t border-black/[0.06] px-4 py-2 text-[12px] text-red-600">{detailError}</p>
        ) : null}
        {selected && (
          <AppDetailSheet item={selected} onBack={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function AppDetailSheet({ item, onBack }: { item: RecommendPanelItem; onBack: () => void }) {
  const platforms = item.supportedPlatforms ?? (item.platform ? [item.platform] : []);
  const downloads = item.downloads ?? [];

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button className="px-1 text-[15px] text-blue-600" type="button" onClick={onBack}>
          返回
        </button>
        <span className="text-[15px] font-semibold">应用详情</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-5">
        <div className="flex items-center gap-3">
          {item.iconUrl ? (
            <img src={item.iconUrl} alt="" className="h-16 w-16 rounded-[14px] object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-[14px] bg-slate-200" />
          )}
          <div className="min-w-0">
            <div className="text-[17px] font-semibold leading-5">{item.name}</div>
            <div className="mt-1 text-[13px] leading-4 text-slate-500">{item.tagline}</div>
          </div>
        </div>
        {platforms.length > 0 && (
          <div className="mt-4">
            <p className="text-[12px] font-medium text-slate-500">支持的平台</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {platforms.map((platform) => (
                <span
                  key={platform}
                  className="rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[12px] text-slate-700"
                >
                  {PLATFORM_LABELS[platform] ?? platform}
                </span>
              ))}
            </div>
          </div>
        )}
        {item.description ? (
          <div className="mt-4">
            <p className="text-[12px] font-medium text-slate-500">介绍</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-slate-700">{item.description}</p>
          </div>
        ) : null}
        <div className="mt-4">
          <p className="text-[12px] font-medium text-slate-500">下载</p>
          <div className="mt-2 space-y-2">
            {downloads.length === 0 ? (
              <p className="text-[13px] text-slate-500">暂无下载地址</p>
            ) : (
              downloads.map((download) => (
                <DownloadButton key={`${download.kind}-${download.label}-${download.url}`} download={download} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadButton({ download }: { download: ListingDownload }) {
  return (
    <button
      className="w-full rounded-full bg-[#f2f2f7] px-4 py-2.5 text-[13px] font-medium text-slate-800"
      type="button"
    >
      {download.label}
    </button>
  );
}
