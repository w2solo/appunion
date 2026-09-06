import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInRecommendPool, isCatalogVisible } from "@appunions/db";
import {
  buildDownloads,
  isSuperAdminEmail,
  isValidCategoryName,
  isValidHttpsUrl,
  isValidPackageName,
  normalizeCategoryName,
  parseDownloadStores,
  parseExtraDownloads,
} from "@appunions/shared";
import { pickRandom } from "./lib/random.js";
import { hashApiKey, generateApiKey } from "./lib/api-keys.js";
import { isMockAppId, MOCK_APPS, mockIconSvg, mockList, mockRecommend } from "./lib/mock-catalog.js";

describe("recommend pool eligibility", () => {
  const config = { graceDays: 7, reciprocityImpressions: 100 };
  const base = {
    reviewStatus: "approved" as const,
    pausedByDeveloper: false,
    pausedByOps: false,
    approvedAt: new Date(),
    contributedImpressions7d: 0,
  };

  it("excludes pending and paused apps", () => {
    assert.equal(
      computeInRecommendPool({ ...base, reviewStatus: "pending" }, config),
      false,
    );
    assert.equal(computeInRecommendPool({ ...base, pausedByDeveloper: true }, config), false);
    assert.equal(computeInRecommendPool({ ...base, pausedByOps: true }, config), false);
    assert.equal(isCatalogVisible({ ...base, pausedByDeveloper: true }), false);
  });

  it("keeps approved apps in pool during grace", () => {
    assert.equal(computeInRecommendPool({ ...base, contributedImpressions7d: 0 }, config), true);
  });

  it("drops apps after grace if under threshold", () => {
    const approvedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    assert.equal(
      computeInRecommendPool({ ...base, approvedAt, contributedImpressions7d: 10 }, config),
      false,
    );
    assert.equal(
      computeInRecommendPool({ ...base, approvedAt, contributedImpressions7d: 100 }, config),
      true,
    );
  });
});

describe("random pick", () => {
  it("does not duplicate within one response", () => {
    const items = ["a", "b", "c", "d", "e"];
    const picked = pickRandom(items, 10);
    assert.equal(new Set(picked).size, picked.length);
    assert.ok(picked.length <= items.length);
  });

  it("respects limit", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    assert.equal(pickRandom(items, 10).length, 10);
  });
});

describe("api keys", () => {
  it("hashes consistently and prefixes auk_live_", () => {
    const key = generateApiKey();
    assert.ok(key.plaintext.startsWith("auk_live_"));
    assert.equal(hashApiKey(key.plaintext), key.hash);
    assert.notEqual(hashApiKey("other"), key.hash);
  });
});

describe("package names", () => {
  it("accepts reverse-dns ids and rejects junk", () => {
    assert.equal(isValidPackageName("com.company.app"), true);
    assert.equal(isValidPackageName("com.company.my-app"), true);
    assert.equal(isValidPackageName("app"), false);
    assert.equal(isValidPackageName("com."), false);
    assert.equal(isValidPackageName(""), false);
  });
});

describe("super admin", () => {
  it("matches the configured email case-insensitively", () => {
    assert.equal(isSuperAdminEmail("admin@example.com", "admin@example.com"), true);
    assert.equal(isSuperAdminEmail("  ADMIN@example.com ", "admin@example.com"), true);
    assert.equal(isSuperAdminEmail("other@example.com", "admin@example.com"), false);
    assert.equal(isSuperAdminEmail("admin@example.com", ""), false);
    assert.equal(isSuperAdminEmail("admin@example.com"), false);
  });
});

describe("categories", () => {
  it("normalizes and caps names", () => {
    assert.equal(normalizeCategoryName("  文件  管理 "), "文件 管理");
    assert.equal(isValidCategoryName("文件管理"), true);
    assert.equal(isValidCategoryName(""), false);
    assert.equal(isValidCategoryName("   "), false);
  });
});

describe("mock catalog", () => {
  it("has a stable pool of 16 apps with unique ids", () => {
    assert.equal(MOCK_APPS.length, 16);
    assert.equal(new Set(MOCK_APPS.map((app) => app.id)).size, 16);
    for (const app of MOCK_APPS) {
      assert.equal(isMockAppId(app.id), true);
    }
    assert.equal(isMockAppId("00000000-0000-4000-8000-000000000099"), false);
  });

  it("recommend respects limit and does not duplicate", () => {
    const items = mockRecommend("android", 10);
    assert.equal(items.length, 10);
    assert.equal(new Set(items.map((item) => item.id)).size, 10);
    assert.ok(items.every((item) => item.platform === "android"));
    assert.ok(items.every((item) => item.package_name.startsWith("com.appunions.mock.")));
    assert.ok(items.every((item) => item.description.length > 0));
    assert.ok(items.every((item) => item.supported_platforms.includes("android")));
    assert.ok(items.every((item) => item.downloads.length > 0));
    assert.ok(items.every((item) => item.downloads.every((d) => d.label.length > 0)));
  });

  it("recommend does not exceed pool size", () => {
    const items = mockRecommend("ios", 50);
    assert.equal(items.length, MOCK_APPS.length);
  });

  it("list paginates with a stable total", () => {
    const page1 = mockList("harmonyos", 1, 10);
    const page2 = mockList("harmonyos", 2, 10);
    assert.equal(page1.total, 16);
    assert.equal(page1.page_size, 10);
    assert.equal(page1.items.length, 10);
    assert.equal(page2.items.length, 6);
    assert.equal(page1.items[0]?.id, MOCK_APPS[0]?.id);
    assert.equal(page2.items[0]?.id, MOCK_APPS[10]?.id);
    assert.ok(page1.items.every((item) => item.platform === "harmonyos"));
    assert.ok(page1.items.every((item) => item.downloads.some((d) => d.kind === "store" && d.label === "鸿蒙应用市场")));
  });

  it("serves svg icons only for mock ids", () => {
    const svg = mockIconSvg(MOCK_APPS[0]!.id);
    assert.ok(svg?.includes("<svg"));
    assert.ok(svg?.includes("速"));
    assert.equal(mockIconSvg("not-a-mock-id"), null);
  });
});

describe("android downloads", () => {
  it("builds store urls and extra links, falling back to market", () => {
    const withStores = buildDownloads({
      platform: "android",
      packageName: "com.company.app",
      downloadStores: ["huawei", "play"],
      extraDownloads: [{ label: "官网", url: "https://example.com/app" }],
    });
    assert.deepEqual(
      withStores.map((item) => item.label),
      ["华为应用市场", "Google Play", "官网"],
    );
    assert.equal(withStores[0]?.url, "appmarket://details?id=com.company.app");
    assert.equal(withStores[2]?.kind, "url");

    const fallback = buildDownloads({
      platform: "android",
      packageName: "com.company.app",
      downloadStores: [],
      extraDownloads: [],
    });
    assert.equal(fallback.length, 1);
    assert.equal(fallback[0]?.label, "打开应用商店");
    assert.equal(fallback[0]?.url, "market://details?id=com.company.app");
  });

  it("ios and harmonyos keep a store button with empty url", () => {
    const ios = buildDownloads({ platform: "ios", packageName: "com.company.app" });
    assert.equal(ios[0]?.label, "App Store");
    assert.equal(ios[0]?.url, "");
    const harmony = buildDownloads({ platform: "harmonyos", packageName: "com.company.app" });
    assert.equal(harmony[0]?.label, "鸿蒙应用市场");
    assert.equal(harmony[0]?.url, "");
  });

  it("validates https extras and store keys", () => {
    assert.equal(isValidHttpsUrl("https://example.com/a"), true);
    assert.equal(isValidHttpsUrl("http://example.com/a"), false);
    assert.equal(parseDownloadStores(["huawei", "nope"]).ok, false);
    assert.deepEqual(parseDownloadStores(["xiaomi", "xiaomi"]), { ok: true, value: ["xiaomi"] });
    assert.equal(parseExtraDownloads([{ label: "官网", url: "http://x.com" }]).ok, false);
    assert.equal(parseExtraDownloads([{ label: "官网", url: "https://example.com" }]).ok, true);
  });
});
