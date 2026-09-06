import type { Platform } from "@appunions/shared";
import { pickRandom } from "./random.js";

type MockApp = {
  id: string;
  name: string;
  tagline: string;
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

export const MOCK_APPS: readonly MockApp[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "速清",
    tagline: "一键清理缓存和垃圾文件",
    category: "工具",
    subcategory: "清理加速",
    slug: "app01",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "便签匣",
    tagline: "快速记下闪过的想法",
    category: "效率",
    subcategory: "笔记",
    slug: "app02",
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "步数圈",
    tagline: "每天走一走，看见自己的节奏",
    category: "生活",
    subcategory: "健康运动",
    slug: "app03",
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    name: "天气窗",
    tagline: "看一眼就知道要不要带伞",
    category: "生活",
    subcategory: "天气",
    slug: "app04",
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    name: "扫一扫全能",
    tagline: "条码、文档、名片都能认",
    category: "工具",
    subcategory: "扫描识别",
    slug: "app05",
  },
  {
    id: "a0000000-0000-4000-8000-000000000006",
    name: "番茄钟",
    tagline: "专注 25 分钟，休息 5 分钟",
    category: "效率",
    subcategory: "待办",
    slug: "app06",
  },
  {
    id: "a0000000-0000-4000-8000-000000000007",
    name: "单词本",
    tagline: "通勤路上背几个就够",
    category: "教育",
    subcategory: "语言学习",
    slug: "app07",
  },
  {
    id: "a0000000-0000-4000-8000-000000000008",
    name: "食谱卡",
    tagline: "今晚吃什么，翻一翻就有",
    category: "生活",
    subcategory: "美食",
    slug: "app08",
  },
  {
    id: "a0000000-0000-4000-8000-000000000009",
    name: "轻记账",
    tagline: "花了多少，一眼看清",
    category: "生活",
    subcategory: "理财",
    slug: "app09",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000a",
    name: "拼图社",
    tagline: "睡前几块，刚好放松",
    category: "游戏",
    subcategory: "益智",
    slug: "app10",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000b",
    name: "听书角",
    tagline: "开车、散步都能听完一本",
    category: "内容",
    subcategory: "音频播客",
    slug: "app11",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000c",
    name: "日历提醒",
    tagline: "生日和账单不会再忘",
    category: "效率",
    subcategory: "日历",
    slug: "app12",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000d",
    name: "文件匣",
    tagline: "把散落的文件收进一处",
    category: "工具",
    subcategory: "文件管理",
    slug: "app13",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000e",
    name: "密码柜",
    tagline: "只记一个主密码就够",
    category: "效率",
    subcategory: "密码管理",
    slug: "app14",
  },
  {
    id: "a0000000-0000-4000-8000-00000000000f",
    name: "通勤导航",
    tagline: "少走弯路，赶上这班车",
    category: "生活",
    subcategory: "出行导航",
    slug: "app15",
  },
  {
    id: "a0000000-0000-4000-8000-000000000010",
    name: "睡眠灯",
    tagline: "白噪音帮你慢慢睡着",
    category: "生活",
    subcategory: "健康运动",
    slug: "app16",
  },
];

const MOCK_IDS = new Set(MOCK_APPS.map((app) => app.id));

export type MockListing = {
  id: string;
  name: string;
  icon_url: string;
  tagline: string;
  category: string;
  subcategory: string;
  platform: Platform;
  package_name: string;
};

export function isMockAppId(id: string): boolean {
  return MOCK_IDS.has(id);
}

export function mockIconUrl(id: string): string {
  return `/media/mock-icons/${id}.svg`;
}

function listingOf(app: MockApp, platform: Platform): MockListing {
  return {
    id: app.id,
    name: app.name,
    icon_url: mockIconUrl(app.id),
    tagline: app.tagline,
    category: app.category,
    subcategory: app.subcategory,
    platform,
    package_name: `com.appunions.mock.${app.slug}`,
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
