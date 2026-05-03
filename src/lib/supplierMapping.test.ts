import { describe, it, expect } from "vitest";
import {
  getDefaultSupplier,
  SUPPLIER_LABELS,
  SUPPLIER_BADGE_CLASSES,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  BATCH_STATUS_LABELS,
  BATCH_STATUS_BADGE,
  REFURB_INVENTORY_STATUS_LABELS,
  REFURB_INVENTORY_STATUS_BADGE,
} from "./supplierMapping";

// ══════════════════════════════════════════════════════════════════════════
// getDefaultSupplier
// ══════════════════════════════════════════════════════════════════════════
describe("getDefaultSupplier", () => {
  // ── 創葆（CR-4 / CR-1）──────────────────────────────────────────────
  it("CR-4 各種格式 → chuangbao", () => {
    expect(getDefaultSupplier("CR-4")).toBe("chuangbao");
    expect(getDefaultSupplier("cr-4")).toBe("chuangbao");
    expect(getDefaultSupplier("cr4")).toBe("chuangbao");
    expect(getDefaultSupplier("CR 4")).toBe("chuangbao");
    expect(getDefaultSupplier("  CR-4  ")).toBe("chuangbao");
  });

  it("CR-1 → chuangbao", () => {
    expect(getDefaultSupplier("CR-1")).toBe("chuangbao");
    expect(getDefaultSupplier("cr1")).toBe("chuangbao");
  });

  // ── 正能量（CR-5 / CR-5L）──────────────────────────────────────────
  it("CR-5 各種格式 → zhengnengliang", () => {
    expect(getDefaultSupplier("CR-5")).toBe("zhengnengliang");
    expect(getDefaultSupplier("cr-5")).toBe("zhengnengliang");
    expect(getDefaultSupplier("cr5")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR 5")).toBe("zhengnengliang");
  });

  it("CR-5L 各種格式 → zhengnengliang", () => {
    expect(getDefaultSupplier("CR-5L")).toBe("zhengnengliang");
    expect(getDefaultSupplier("cr-5l")).toBe("zhengnengliang");
    expect(getDefaultSupplier("cr5l")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR 5L")).toBe("zhengnengliang");
  });

  // ── CR-5 與 CR-5L 互不混淆 ──────────────────────────────────────────
  it("CR-5 不因前綴匹配到 CR-5L，兩者都正確回傳 zhengnengliang", () => {
    expect(getDefaultSupplier("CR-5")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR-5L")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR-5")).not.toBeNull();
    expect(getDefaultSupplier("CR-5L")).not.toBeNull();
  });

  // ── 無預設（CR-F 及未知型號）──────────────────────────────────────
  it("CR-F → null（無預設供應商）", () => {
    expect(getDefaultSupplier("CR-F")).toBeNull();
    expect(getDefaultSupplier("crf")).toBeNull();
    expect(getDefaultSupplier("CR-F1")).toBeNull();
  });

  it("空值 / null / undefined → null", () => {
    expect(getDefaultSupplier(null)).toBeNull();
    expect(getDefaultSupplier(undefined)).toBeNull();
    expect(getDefaultSupplier("")).toBeNull();
    expect(getDefaultSupplier("   ")).toBeNull();
  });

  it("完全未知型號 → null", () => {
    expect(getDefaultSupplier("TERIC")).toBeNull();
    expect(getDefaultSupplier("OTHER")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPLIER_LABELS
// ══════════════════════════════════════════════════════════════════════════
describe("SUPPLIER_LABELS", () => {
  it("chuangbao → 創葆", () => {
    expect(SUPPLIER_LABELS.chuangbao).toBe("創葆");
  });
  it("zhengnengliang → 正能量", () => {
    expect(SUPPLIER_LABELS.zhengnengliang).toBe("正能量");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPLIER_BADGE_CLASSES
// ══════════════════════════════════════════════════════════════════════════
describe("SUPPLIER_BADGE_CLASSES", () => {
  it("chuangbao badge 為藍色系", () => {
    expect(SUPPLIER_BADGE_CLASSES.chuangbao).toMatch(/blue/);
  });
  it("zhengnengliang badge 為綠色系", () => {
    expect(SUPPLIER_BADGE_CLASSES.zhengnengliang).toMatch(/emerald/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPLIER_STATUS_LABELS（5 個狀態）
// ══════════════════════════════════════════════════════════════════════════
describe("SUPPLIER_STATUS_LABELS", () => {
  const EXPECTED: Record<string, string> = {
    pending_send: "待寄出",
    at_factory: "工廠維修中",
    repaired: "工廠完工",
    returned: "已驗收完成",
    scrapped: "報廢",
  };

  it.each(Object.entries(EXPECTED))("status %s → %s", (key, label) => {
    expect(SUPPLIER_STATUS_LABELS[key]).toBe(label);
  });

  it("涵蓋全部 5 個狀態", () => {
    expect(Object.keys(SUPPLIER_STATUS_LABELS)).toHaveLength(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPLIER_STATUS_BADGE（5 個狀態都有 CSS class）
// ══════════════════════════════════════════════════════════════════════════
describe("SUPPLIER_STATUS_BADGE", () => {
  const STATUS_KEYS = ["pending_send", "at_factory", "repaired", "returned", "scrapped"];

  it.each(STATUS_KEYS)("status %s 有 badge class", (key) => {
    expect(SUPPLIER_STATUS_BADGE[key]).toBeTruthy();
    expect(typeof SUPPLIER_STATUS_BADGE[key]).toBe("string");
  });

  it("scrapped badge 為紅色系", () => {
    expect(SUPPLIER_STATUS_BADGE.scrapped).toMatch(/red/);
  });

  it("returned badge 為綠色系", () => {
    expect(SUPPLIER_STATUS_BADGE.returned).toMatch(/emerald/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BATCH_STATUS_LABELS（3 個狀態）
// ══════════════════════════════════════════════════════════════════════════
describe("BATCH_STATUS_LABELS", () => {
  it("draft → 含「草稿」文字", () => {
    expect(BATCH_STATUS_LABELS.draft).toMatch(/草稿/);
  });
  it("shipped → 含「寄出」文字", () => {
    expect(BATCH_STATUS_LABELS.shipped).toMatch(/寄出/);
  });
  it("received → 含「收回」文字", () => {
    expect(BATCH_STATUS_LABELS.received).toMatch(/收回/);
  });
  it("涵蓋全部 3 個狀態", () => {
    expect(Object.keys(BATCH_STATUS_LABELS)).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BATCH_STATUS_BADGE（3 個狀態都有 CSS class）
// ══════════════════════════════════════════════════════════════════════════
describe("BATCH_STATUS_BADGE", () => {
  const BATCH_KEYS = ["draft", "shipped", "received"];

  it.each(BATCH_KEYS)("status %s 有 badge class", (key) => {
    expect(BATCH_STATUS_BADGE[key]).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REFURB_INVENTORY_STATUS_LABELS（4 個狀態）
// ══════════════════════════════════════════════════════════════════════════
describe("REFURB_INVENTORY_STATUS_LABELS", () => {
  const EXPECTED: Record<string, string> = {
    in_stock: "在庫",
    used_warranty: "已撥用保固",
    sold: "已售出",
    scrapped: "報廢",
  };

  it.each(Object.entries(EXPECTED))("status %s → %s", (key, label) => {
    expect(REFURB_INVENTORY_STATUS_LABELS[key]).toBe(label);
  });

  it("涵蓋全部 4 個狀態", () => {
    expect(Object.keys(REFURB_INVENTORY_STATUS_LABELS)).toHaveLength(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REFURB_INVENTORY_STATUS_BADGE（4 個狀態都有 CSS class）
// ══════════════════════════════════════════════════════════════════════════
describe("REFURB_INVENTORY_STATUS_BADGE", () => {
  const INV_KEYS = ["in_stock", "used_warranty", "sold", "scrapped"];

  it.each(INV_KEYS)("status %s 有 badge class", (key) => {
    expect(REFURB_INVENTORY_STATUS_BADGE[key]).toBeTruthy();
  });

  it("in_stock badge 為綠色系", () => {
    expect(REFURB_INVENTORY_STATUS_BADGE.in_stock).toMatch(/emerald/);
  });

  it("scrapped badge 為紅色系", () => {
    expect(REFURB_INVENTORY_STATUS_BADGE.scrapped).toMatch(/red/);
  });
});
