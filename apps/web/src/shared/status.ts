import { PLATFORM_LABELS, type Platform } from "@appunions/shared";

export function statusLabel(app: {
  reviewStatus: string;
  pausedByDeveloper: boolean;
  pausedByOps: boolean;
  inRecommendPool: boolean;
  graceDaysLeft?: number;
}) {
  if (app.pausedByOps) return { text: "运营暂停", className: "bg-red-100 text-red-800" };
  if (app.pausedByDeveloper) return { text: "已隐藏", className: "bg-slate-200 text-slate-700" };
  if (app.reviewStatus === "pending") return { text: "待审核", className: "bg-amber-100 text-amber-800" };
  if (app.reviewStatus === "rejected") return { text: "已拒绝", className: "bg-red-100 text-red-800" };
  if (app.inRecommendPool && (app.graceDaysLeft ?? 0) > 0) {
    return { text: "观察期", className: "bg-blue-100 text-blue-800" };
  }
  if (app.inRecommendPool) return { text: "推荐中", className: "bg-green-100 text-green-800" };
  return { text: "未达互惠", className: "bg-orange-100 text-orange-800" };
}

export function platformLabel(p: string) {
  return PLATFORM_LABELS[p as Platform] ?? p;
}
