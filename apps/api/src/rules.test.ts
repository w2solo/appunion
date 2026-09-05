import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInRecommendPool, isCatalogVisible } from "@appunions/db";
import { isSuperAdminEmail, isValidPackageName } from "@appunions/shared";
import { pickRandom } from "./lib/random.js";
import { hashApiKey, generateApiKey } from "./lib/api-keys.js";

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
  it("matches the hardcoded email case-insensitively", () => {
    assert.equal(isSuperAdminEmail("cmlanche@qq.com"), true);
    assert.equal(isSuperAdminEmail("  CMLANCHE@qq.com "), true);
    assert.equal(isSuperAdminEmail("admin@appunions.local"), false);
  });
});
