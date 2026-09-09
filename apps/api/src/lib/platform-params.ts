import { z } from "zod";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@appunions/shared";

export const platformsSchema = z.object({
  platforms: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        packageName: z.string().min(1),
        downloadStores: z.array(z.string()).optional(),
        extraDownloads: z.array(z.object({ label: z.string().optional(), url: z.string() })).optional(),
      }),
    )
    .max(PLATFORMS.length),
});

function platformLabelFromRaw(raw: unknown, index: unknown): string {
  if (typeof index !== "number" || !raw || typeof raw !== "object") return "";
  const platforms = (raw as { platforms?: unknown }).platforms;
  if (!Array.isArray(platforms)) return "";
  const item = platforms[index];
  if (!item || typeof item !== "object") return "";
  const platform = (item as { platform?: unknown }).platform;
  if (typeof platform !== "string") return "";
  return PLATFORM_LABELS[platform as Platform] ?? "";
}

export function platformsSchemaError(error: z.ZodError, raw: unknown): string {
  const issue = error.issues[0];
  if (!issue) return "平台参数无效";
  const [root, index, field] = issue.path;
  if (root !== "platforms") return "平台参数无效";
  if (field === undefined) {
    if (issue.code === "too_big") return `最多只能配置 ${PLATFORMS.length} 个端`;
    return "平台列表无效";
  }
  if (field === "platform") return "不支持的系统端";
  if (field === "packageName") {
    const label = platformLabelFromRaw(raw, index);
    if (issue.code === "too_small") return label ? `请填写 ${label} 包名` : "请填写包名";
    return label ? `${label} 包名无效` : "包名无效";
  }
  if (field === "downloadStores") return "下载平台无效";
  if (field === "extraDownloads") return "官网地址无效";
  return "平台参数无效";
}

export function parsePlatformsPayload(raw: unknown) {
  const parsed = platformsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: platformsSchemaError(parsed.error, raw) };
  }
  return { ok: true as const, data: parsed.data };
}
