import { describe, it, expect } from "vitest";
import {
  getRefurbPrices,
  isWithinWarranty,
  formatNT,
  buildDiagnosisNotificationBody,
  REFURB_PRICES,
  DEFAULT_REFURB_PRICES,
  ACTUAL_METHOD_LABELS,
} from "./refurbishedPricing";

// ── getRefurbPrices ────────────────────────────────────────────────────────
describe("getRefurbPrices", () => {
  it("CR-4 回傳正確三級價格", () => {
    expect(getRefurbPrices("CR-4")).toEqual({ A: 3680, B: 3180, C: 2680 });
  });

  it("CR-5L 回傳正確三級價格", () => {
    expect(getRefurbPrices("CR-5L")).toEqual({ A: 5780, B: 5180, C: 4580 });
  });

  it("小寫 cr-4 也能比對（不分大小寫）", () => {
    expect(getRefurbPrices("cr-4")).toEqual(REFURB_PRICES["CR-4"]);
  });

  it("無連字號 CR5L 也能比對", () => {
    expect(getRefurbPrices("CR5L")).toEqual(REFURB_PRICES["CR-5L"]);
  });

  it("帶空白 CR 5L 也能比對", () => {
    expect(getRefurbPrices("CR 5L")).toEqual(REFURB_PRICES["CR-5L"]);
  });

  it("未知型號回傳 DEFAULT（全 0）", () => {
    expect(getRefurbPrices("TERIC")).toEqual(DEFAULT_REFURB_PRICES);
    expect(getRefurbPrices("UNKNOWN")).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("null 回傳 DEFAULT", () => {
    expect(getRefurbPrices(null)).toEqual(DEFAULT_REFURB_PRICES);
  });

  it("undefined 回傳 DEFAULT", () => {
    expect(getRefurbPrices(undefined)).toEqual(DEFAULT_REFURB_PRICES);
  });
});

// ── isWithinWarranty ───────────────────────────────────────────────────────
describe("isWithinWarranty", () => {
  it("未來日期回傳 true（保固內）", () => {
    expect(isWithinWarranty("2099-12-31")).toBe(true);
  });

  it("過去日期回傳 false（過保固）", () => {
    expect(isWithinWarranty("2020-01-01")).toBe(false);
  });

  it("null 回傳 false", () => {
    expect(isWithinWarranty(null)).toBe(false);
  });

  it("undefined 回傳 false", () => {
    expect(isWithinWarranty(undefined)).toBe(false);
  });
});

// ── formatNT ───────────────────────────────────────────────────────────────
describe("formatNT", () => {
  it("3680 格式化為 NT$ 3,680", () => {
    expect(formatNT(3680)).toBe("NT$ 3,680");
  });

  it("0 格式化為 NT$ 0", () => {
    expect(formatNT(0)).toBe("NT$ 0");
  });

  it("10000 格式化為 NT$ 10,000", () => {
    expect(formatNT(10000)).toBe("NT$ 10,000");
  });
});

// ── ACTUAL_METHOD_LABELS ───────────────────────────────────────────────────
describe("ACTUAL_METHOD_LABELS", () => {
  it("所有 method 都有對應中文標籤", () => {
    expect(ACTUAL_METHOD_LABELS.warranty_replace).toBe("保固換整新機");
    expect(ACTUAL_METHOD_LABELS.purchase_a).toBe("購買 A 級整新機");
    expect(ACTUAL_METHOD_LABELS.purchase_b).toBe("購買 B 級整新機");
    expect(ACTUAL_METHOD_LABELS.purchase_c).toBe("購買 C 級整新機");
    expect(ACTUAL_METHOD_LABELS.return_original).toBe("原錶退回");
  });
});

// ── buildDiagnosisNotificationBody ────────────────────────────────────────
describe("buildDiagnosisNotificationBody", () => {
  it("保固內：包含「更換整新機」和「免費」", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "CR-4",
      serialNumber: "SN12345",
      withinWarranty: true,
      diagnosis: "顯示器異常",
    });
    expect(body).toContain("更換整新機");
    expect(body).toContain("免費");
    expect(body).toContain("SN12345");
    expect(body).toContain("顯示器異常");
    expect(body).not.toContain("A 級整新機");
  });

  it("過保固 CR-4：包含三級正確價格", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "CR-4",
      serialNumber: "SN12345",
      withinWarranty: false,
      diagnosis: "電池問題",
    });
    expect(body).toContain("NT$ 3,680");
    expect(body).toContain("NT$ 3,180");
    expect(body).toContain("NT$ 2,680");
    expect(body).toContain("原錶退回");
    expect(body).toContain("電池問題");
    expect(body).not.toContain("更換整新機（免費）");
  });

  it("過保固 CR-5L：包含 CR-5L 價格", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "CR-5L",
      serialNumber: null,
      withinWarranty: false,
    });
    expect(body).toContain("NT$ 5,780");
    expect(body).toContain("NT$ 5,180");
    expect(body).toContain("NT$ 4,580");
  });

  it("過保固未知型號：三級價格顯示 NT$ 0", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "TERIC",
      serialNumber: null,
      withinWarranty: false,
    });
    expect(body).toContain("NT$ 0");
  });

  it("無診斷描述時不出現「檢測結果」行", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "CR-4",
      serialNumber: null,
      withinWarranty: false,
      diagnosis: null,
    });
    expect(body).not.toContain("檢測結果");
  });

  it("序號為 null 時不出現序號行", () => {
    const body = buildDiagnosisNotificationBody({
      productModel: "CR-4",
      serialNumber: null,
      withinWarranty: true,
    });
    expect(body).not.toContain("序號");
  });
});
