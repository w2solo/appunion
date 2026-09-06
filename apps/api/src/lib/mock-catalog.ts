import {
  buildDownloads,
  type ExtraDownload,
  type ListingItem,
  type Platform,
} from "@appunions/shared";
import { pickRandom } from "./random.js";

type MockApp = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  subcategory: string;
  slug: string;
};

const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#ea580c",
  "#9333ea",
  "#0284c7",
  "#65a30d",
  "#e11d48",
  "#57534e",
] as const;

function desc(tagline: string, extra: string): string {
  return `${tagline}。${extra}`;
}

export const MOCK_APPS: readonly MockApp[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "速清",
    tagline: "一键清理缓存和垃圾文件",
    description: desc("一键清理缓存和垃圾文件", "扫描缓存、残留安装包和无用日志，清理前后会告诉你腾出了多少空间。"),
    category: "工具",
    subcategory: "清理加速",
    slug: "app01",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "便签匣",
    tagline: "快速记下闪过的想法",
    description: desc("快速记下闪过的想法", "打开就能写，支持清单和简单分类，适合随手记待办和灵感。"),
    category: "效率",
    subcategory: "笔记",
    slug: "app02",
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "步数圈",
    tagline: "每天走一走，看见自己的节奏",
    description: desc("每天走一走，看见自己的节奏", "记录步数和活动时长，用一周趋势看自己有没有慢慢动起来。"),
    category: "生活",
    subcategory: "健康运动",
    slug: "app03",
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    name: "天气窗",
    tagline: "看一眼就知道要不要带伞",
    description: desc("看一眼就知道要不要带伞", "关注降雨、体感和空气质量，出门前看一眼就够。"),
    category: "生活",
    subcategory: "天气",
    slug: "app04",
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    name: "扫一扫全能",
    tagline: "条码、文档、名片都能认",
    description: desc("条码、文档、名片都能认", "扫码、拍文档、认名片，结果可以复制或存到本地。"),
    category: "工具",
    subcategory: "扫描识别",
    slug: "app05",
  },
  {
    id: "a0000000-0000-4000-8000-000000000006",
    name: "番茄钟",
    tagline: "专注 25 分钟，休息 5 分钟",
    description: desc("专注 25 分钟，休息 5 分钟", "按番茄工作法计时，专注结束会提醒休息，也可改成自己的节奏。"),
    category: "效率",
    subcategory: "待办",
    slug: "app06",
  },
  {
    id: "a0000000-0000-4000-8000-000000000007",
    name: "单词本",
    tagline: "通勤路上背几个就够",
    description: desc("通勤路上背几个就够", "每天少量复习，错过的词会再出现，适合碎片时间。"),
    category: "教育",
    subcategory: "语言学习",
    slug: "app07",
  },
  {
    id: "a0000000-0000-4000-8000-000000000008",
    name: "食谱卡",
    tagline: "今晚吃什么，翻一翻就有",
    description: desc("今晚吃什么，翻一翻就有", "按家里现有食材翻菜谱，步骤短、用料清楚。"),
    category: "生活",
    subcategory: "美食",
    slug: "app08",
  },
  {
    id: "a0000000-0000-4000-8000-000000000009",
    name: "轻记账",
    tagline: "花了多少，一眼看清",
    description: desc("花了多少，一眼看清", "记一笔很快，按分类看本周花在哪，不做复杂报表。"),
    category: "生活",
    subcategory: "理财",
    slug: "app09",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000a",
    name: "拼图社",
    tagline: "睡前几块，刚好放松",
    description: desc("睡前几块，刚好放松", "轻量拼图，几分钟就能完成一局，没有限时压力。"),
    category: "游戏",
    subcategory: "益智",
    slug: "app10",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000b",
    name: "听书角",
    tagline: "开车、散步都能听完一本",
    description: desc("开车、散步都能听完一本", "后台播放，记住进度，适合通勤和睡前。"),
    category: "内容",
    subcategory: "音频播客",
    slug: "app11",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000c",
    name: "日历提醒",
    tagline: "生日和账单不会再忘",
    description: desc("生日和账单不会再忘", "重复提醒、提前通知，生日、账单和纪念日都能放进来。"),
    category: "效率",
    subcategory: "日历",
    slug: "app12",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000d",
    name: "文件匣",
    tagline: "把散落的文件收进一处",
    description: desc("把散落的文件收进一处", "按文件夹整理文档和图片，支持搜索和简单预览。"),
    category: "工具",
    subcategory: "文件管理",
    slug: "app13",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000e",
    name: "密码柜",
    tagline: "只记一个主密码就够",
    description: desc("只记一个主密码就够", "本地加密保存账号密码，复制即用，不做云同步。"),
    category: "效率",
    subcategory: "密码管理",
    slug: "app14",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000f",
    name: "通勤导航",
    tagline: "少走弯路，赶上这班车",
    description: desc("少走弯路，赶上这班车", "看路况和到站时间，出门前规划一条更稳的路线。"),
    category: "生活",
    subcategory: "出行导航",
    slug: "app15",
  },
  {
    id: "a0000000-0000-4000-8000-000000000010",
    name: "睡眠灯",
    tagline: "白噪音帮你慢慢睡着",
    description: desc("白噪音帮你慢慢睡着", "雨声、风扇和轻音乐，定时关闭，不打扰第二天起床。"),
    category: "生活",
    subcategory: "健康运动",
    slug: "app16",
  },
];

const MOCK_IDS = new Set(MOCK_APPS.map((app) => app.id));

export type MockListing = ListingItem;

export function isMockAppId(id: string): boolean {
  return MOCK_IDS.has(id);
}

export function mockIconUrl(id: string): string {
  return `/media/mock-icons/${id}.svg`;
}

function mockAndroidStores(slug: string) {
  const n = slug.charCodeAt(slug.length - 1) % 3;
  if (n === 0) return ["play", "huawei"] as const;
  if (n === 1) return ["xiaomi", "tencent"] as const;
  return [] as const;
}

function mockExtras(app: MockApp): ExtraDownload[] {
  if (app.slug.endsWith("5") || app.slug.endsWith("0")) {
    return [{ label: "官网", url: `https://example.com/${app.slug}` }];
  }
  return [];
}

function listingOf(app: MockApp, platform: Platform): ListingItem {
  const packageName = `com.appunions.mock.${app.slug}`;
  return {
    id: app.id,
    name: app.name,
    icon_url: mockIconUrl(app.id),
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    subcategory: app.subcategory,
    platform,
    package_name: packageName,
    supported_platforms: ["android", "ios", "harmonyos"],
    downloads: buildDownloads({
      platform,
      packageName,
      downloadStores: platform === "android" ? [...mockAndroidStores(app.slug)] : [],
      extraDownloads: platform === "android" ? mockExtras(app) : [],
    }),
  };
}

export function mockRecommend(platform: Platform, limit: number): MockListing[] {
  return pickRandom([...MOCK_APPS], limit).map((app) => listingOf(app, platform));
}

export function mockList(platform: Platform, page: number, pageSize: number) {
  const total = MOCK_APPS.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const items = MOCK_APPS.slice(start, start + pageSize).map((app) => listingOf(app, platform));
  return { items, page, page_size: pageSize, total };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function mockIconSvg(id: string): string | null {
  const index = MOCK_APPS.findIndex((app) => app.id === id);
  const app = MOCK_APPS[index];
  if (!app) return null;
  const color = PALETTE[index % PALETTE.length]!;
  const letter = [...app.name][0] ?? "?";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${color}"/>
  <text x="64" y="80" text-anchor="middle" font-size="56" font-family="system-ui,sans-serif" fill="#fff">${escapeXml(letter)}</text>
</svg>`;
}
