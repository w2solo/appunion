export type RecommendPanelItem = {
  id: string;
  name: string;
  iconUrl?: string;
  tagline: string;
};

export function RecommendListPanel({
  items,
  onShuffle,
  shuffling,
  emptyText = "暂时没有可展示的应用",
}: {
  items: RecommendPanelItem[];
  onShuffle?: () => void;
  shuffling?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] bg-[#f2f2f7] p-3">
      <div className="overflow-hidden rounded-[14px] bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[15px] font-semibold tracking-tight">发现应用</span>
          {onShuffle && (
            <button
              className="text-[13px] font-medium text-blue-600 disabled:opacity-50"
              disabled={shuffling}
              type="button"
              onClick={onShuffle}
            >
              {shuffling ? "换一批…" : "换一批"}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="border-t border-black/[0.06] px-4 py-8 text-center text-[13px] text-slate-500">{emptyText}</p>
        ) : (
          <ul>
            {items.map((item, i) => (
              <li key={item.id} className={i > 0 ? "border-t border-black/[0.06]" : "border-t border-black/[0.06]"}>
                <div className="flex items-center gap-3 px-4 py-2.5">
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
                    打开
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
