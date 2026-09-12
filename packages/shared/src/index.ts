export const PLATFORMS = ["android", "ios", "harmonyos"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  android: "Android",
  ios: "iOS",
  harmonyos: "鸿蒙",
};

export const CATEGORY_NAME_MAX = 20;

export const DEFAULT_CATEGORY_TREE: { name: string; children: string[] }[] = [
  { name: "工具", children: ["系统工具", "文件管理", "清理加速", "输入法", "浏览器", "扫描识别", "其他"] },
  { name: "效率", children: ["笔记", "待办", "日历", "办公文档", "邮箱", "密码管理", "其他"] },
  { name: "内容", children: ["新闻资讯", "阅读", "视频", "音频播客", "图文社区", "其他"] },
  { name: "社交", children: ["即时通讯", "社区论坛", "约会交友", "其他"] },
  { name: "游戏", children: ["休闲", "益智", "动作", "策略", "角色扮演", "其他"] },
  { name: "教育", children: ["语言学习", "考试备考", "儿童教育", "技能培训", "其他"] },
  { name: "生活", children: ["购物", "出行导航", "美食", "健康运动", "天气", "理财", "其他"] },
  { name: "其他", children: ["未分类"] },
];

export const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  tools: "工具",
  productivity: "效率",
  content: "内容",
  social: "社交",
  game: "游戏",
  education: "教育",
  lifestyle: "生活",
  other: "其他",
};

export function normalizeCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidCategoryName(value: string): boolean {
  const name = normalizeCategoryName(value);
  return name.length > 0 && graphemeLength(name) <= CATEGORY_NAME_MAX;
}

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ROLES = ["developer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isSuperAdminEmail(email: string, configured?: string): boolean {
  const target = configured?.trim().toLowerCase();
  if (!target) return false;
  return email.trim().toLowerCase() === target;
}

export const ERROR_CODES = {
  invalid_params: "invalid_params",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  app_not_approved: "app_not_approved",
  app_paused_by_ops: "app_paused_by_ops",
  target_not_found: "target_not_found",
  rate_limited: "rate_limited",
  internal_error: "internal_error",
  not_found: "not_found",
  invite_required: "invite_required",
  invite_invalid: "invite_invalid",
} as const;

export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += INVITE_CODE_ALPHABET[byte & 31];
  }
  return out;
}

export function normalizeInviteCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of compact) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  }
  return compact;
}

export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code) ?? code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== INVITE_CODE_LENGTH) return code.trim();
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const UNION_NAME_DEFAULT = "应用互推联盟";
export const UNION_SUBTITLE_DEFAULT = "发现更多好用的 App";
export const UNION_DESCRIPTION_DEFAULT =
  "这里汇集了独立开发者做的同平台 App。不是广告，所有应用等权随机出现，点开就能发现更多好用的工具。";
export const UNION_NAME_MAX_GRAPHEMES = 20;
export const UNION_SUBTITLE_MAX_GRAPHEMES = 40;
export const UNION_DESCRIPTION_MAX_GRAPHEMES = 120;
export const UNION_LOGO_ID = "union-logo";

export const TAGLINE_MAX_GRAPHEMES = 30;
export const DESCRIPTION_MAX_GRAPHEMES = 200;
export const EXTRA_DOWNLOAD_MAX = 1;
export const EXTRA_DOWNLOAD_DEFAULT_LABEL = "官网";
export const ANDROID_DOWNLOAD_REQUIRED_ERROR = "请勾选已上架应用商店，或填写官网";
export const ICON_MAX_BYTES = 512 * 1024;
export const PACKAGE_NAME_MAX = 255;

export const ANDROID_STORE = "market";
export const ANDROID_STORE_LABEL = "打开应用商店";

const LEGACY_ANDROID_STORES = [
  "play",
  "huawei",
  "honor",
  "xiaomi",
  "oppo",
  "vivo",
  "tencent",
  "coolapk",
] as const;

export function isAndroidListedToken(value: string): boolean {
  return value === ANDROID_STORE || (LEGACY_ANDROID_STORES as readonly string[]).includes(value);
}

export function androidStoreUrl(packageName: string): string {
  return `market://details?id=${encodeURIComponent(packageName)}`;
}

export type ExtraDownload = { label: string; url: string };

export function isAndroidListed(
  downloadStores?: string[] | null,
  extraDownloads?: ExtraDownload[] | null,
): boolean {
  if ((downloadStores ?? []).some(isAndroidListedToken)) return true;
  return (extraDownloads ?? []).length === 0;
}

export type ListingDownload =
  | { kind: "store"; store: string; label: string; url: string }
  | { kind: "url"; label: string; url: string };

export type ListingCard = {
  id: string;
  name: string;
  icon_url: string;
  tagline: string;
};

export type ListingItem = ListingCard & {
  description: string;
  category: string;
  subcategory: string;
  platform: Platform;
  package_name: string;
  supported_platforms: Platform[];
  downloads: ListingDownload[];
};

export type UnionInfo = {
  name: string;
  subtitle: string;
  description: string;
  logo_url: string;
  hidden: boolean;
};

export function listingCardOf(item: ListingCard): ListingCard {
  return {
    id: item.id,
    name: item.name,
    icon_url: item.icon_url,
    tagline: item.tagline,
  };
}

export function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function supportedPlatformsOf(platforms: { platform: string }[]): Platform[] {
  const set = new Set(platforms.map((item) => item.platform));
  return PLATFORMS.filter((platform) => set.has(platform));
}

export function parseDownloadStores(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "下载平台无效" };
  let listed = false;
  for (const item of raw) {
    if (typeof item !== "string" || !isAndroidListedToken(item)) {
      return { ok: false, error: "下载平台无效" };
    }
    listed = true;
  }
  return { ok: true, value: listed ? [ANDROID_STORE] : [] };
}

export function parseExtraDownloads(
  raw: unknown,
): { ok: true; value: ExtraDownload[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "官网地址无效" };
  if (raw.length > EXTRA_DOWNLOAD_MAX) {
    return { ok: false, error: "官网只需填一条" };
  }
  const value: ExtraDownload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "官网地址无效" };
    }
    const url = String("url" in item ? item.url : "").trim();
    if (!url) continue;
    if (!isValidHttpsUrl(url)) {
      return { ok: false, error: "官网须为 https 链接" };
    }
    value.push({ label: EXTRA_DOWNLOAD_DEFAULT_LABEL, url });
  }
  return { ok: true, value };
}

export function androidDownloadChannelsError(
  downloadStores: string[],
  extraDownloads: ExtraDownload[],
): string | null {
  if (downloadStores.length === 0 && extraDownloads.length === 0) {
    return ANDROID_DOWNLOAD_REQUIRED_ERROR;
  }
  return null;
}

export function buildDownloads(input: {
  platform: Platform;
  packageName: string;
  downloadStores?: string[] | null;
  extraDownloads?: ExtraDownload[] | null;
}): ListingDownload[] {
  if (input.platform === "android") {
    const extras = (input.extraDownloads ?? []).slice(0, EXTRA_DOWNLOAD_MAX);
    const listed = isAndroidListed(input.downloadStores, extras);
    const downloads: ListingDownload[] = [];
    if (listed) {
      downloads.push({
        kind: "store",
        store: ANDROID_STORE,
        label: ANDROID_STORE_LABEL,
        url: androidStoreUrl(input.packageName),
      });
    }
    for (const extra of extras) {
      downloads.push({ kind: "url", label: EXTRA_DOWNLOAD_DEFAULT_LABEL, url: extra.url });
    }
    return downloads;
  }
  if (input.platform === "ios") {
    return [{ kind: "store", store: "appstore", label: "App Store", url: "" }];
  }
  return [{ kind: "store", store: "harmony", label: "鸿蒙应用市场", url: "" }];
}
export const LIST_SIZE_MIN = 1;
export const LIST_SIZE_MAX = 50;
export const LIST_SIZE_DEFAULT = 10;
export const RECOMMEND_MAX = LIST_SIZE_MAX;
export const LIST_DEFAULT_PAGE_SIZE = 20;
export const LIST_MAX_PAGE_SIZE = 50;
export const IMPRESSION_BATCH_MAX = LIST_SIZE_MAX;

/** Android applicationId / iOS bundle id / HarmonyOS bundleName */
export const PACKAGE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/;

export const PACKAGE_NAME_HINTS: Record<Platform, string> = {
  android: "Android applicationId，如 com.company.app",
  ios: "iOS Bundle ID，如 com.company.app",
  harmonyos: "鸿蒙 bundleName，如 com.company.app",
};

export function isValidPackageName(value: string): boolean {
  return value.length > 0 && value.length <= PACKAGE_NAME_MAX && PACKAGE_NAME_RE.test(value);
}

export function graphemeLength(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value].length;
}
