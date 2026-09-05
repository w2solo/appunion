export const PLATFORMS = ["android", "ios", "harmonyos"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  android: "Android",
  ios: "iOS",
  harmonyos: "鸿蒙",
};

export const CATEGORIES = [
  "tools",
  "productivity",
  "content",
  "social",
  "game",
  "education",
  "lifestyle",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tools: "工具",
  productivity: "效率",
  content: "内容",
  social: "社交",
  game: "游戏",
  education: "教育",
  lifestyle: "生活",
  other: "其他",
};

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ROLES = ["developer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SUPER_ADMIN_EMAIL = "cmlanche@qq.com";

export function isSuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const TAGLINE_MAX_GRAPHEMES = 30;
export const ICON_MAX_BYTES = 512 * 1024;
export const PACKAGE_NAME_MAX = 255;
export const RECOMMEND_MAX = 10;
export const LIST_DEFAULT_PAGE_SIZE = 20;
export const LIST_MAX_PAGE_SIZE = 50;
export const IMPRESSION_BATCH_MAX = 10;

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
