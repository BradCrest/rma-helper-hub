import { describe, it, expect } from "vitest";
import {
  parseSerialNumber,
  detectBatch,
  calcWarrantyExpiry,
  evaluateWarranty,
} from "./warrantyPolicy";

describe("parseSerialNumber", () => {
  it("parses CR-4 serial (YY at pos 4-5, WW at pos 6-7)", () => {
    // CBK25160015 -> 2025, week 16
    const r = parseSerialNumber("CBK25160015", "CR-4");
    expect(r).not.toBeNull();
    expect(r!.year).toBe(2025);
    expect(r!.week).toBe(16);
  });

  it("parses CR-5L serial (YY at pos 5-6, WW at pos 7-8)", () => {
    // CBKB25160015 -> 第5-6 = 25 (year), 第7-8 = 16 (week)
    const r = parseSerialNumber("CBKB25160015", "CR-5L");
    expect(r).not.toBeNull();
    expect(r!.year).toBe(2025);
    expect(r!.week).toBe(16);
  });

  it("parses CR-1 serial", () => {
    // CR125160015 -> year 25, week 16
    const r = parseSerialNumber("CR125160015", "CR-1");
    expect(r!.year).toBe(2025);
    expect(r!.week).toBe(16);
  });

  it("parses CR-F serial", () => {
    // CRFY25160015 -> 第5-6=25, 第7-8=16
    const r = parseSerialNumber("CRFY25160015", "CR-F");
    expect(r!.year).toBe(2025);
    expect(r!.week).toBe(16);
  });

  it("handles model with whitespace / dashes", () => {
    expect(parseSerialNumber("CBK22300015", "cr 4")).not.toBeNull();
    expect(parseSerialNumber("CBK22300015", "cr4")).not.toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(parseSerialNumber("", "CR-4")).toBeNull();
    expect(parseSerialNumber("ABC", "CR-4")).toBeNull();
    expect(parseSerialNumber("CBK25160015", "CR-99")).toBeNull();
    expect(parseSerialNumber("CBK99990015", "CR-4")).toBeNull(); // week 99 invalid
  });
});

describe("detectBatch", () => {
  it("classifies legacy (< 2022/11/01)", () => {
    expect(detectBatch(new Date(Date.UTC(2018, 5, 15)))).toBe("legacy_2018_2022");
    expect(detectBatch(new Date(Date.UTC(2022, 9, 31)))).toBe("legacy_2018_2022");
  });

  it("classifies v2 (2022/11/01 – 2025/11/11)", () => {
    expect(detectBatch(new Date(Date.UTC(2022, 10, 1)))).toBe("v2_2022_2025");
    expect(detectBatch(new Date(Date.UTC(2025, 10, 11)))).toBe("v2_2022_2025");
  });

  it("classifies v3 (>= 2025/11/12)", () => {
    expect(detectBatch(new Date(Date.UTC(2025, 10, 12)))).toBe("v3_2025_onwards");
    expect(detectBatch(new Date(Date.UTC(2026, 0, 1)))).toBe("v3_2025_onwards");
  });
});

describe("calcWarrantyExpiry", () => {
  it("legacy → null", () => {
    expect(calcWarrantyExpiry("legacy_2018_2022", new Date())).toBeNull();
  });

  it("v2 → 2 years", () => {
    const start = new Date(Date.UTC(2023, 5, 1));
    const expiry = calcWarrantyExpiry("v2_2022_2025", start)!;
    expect(expiry.getUTCFullYear()).toBe(2025);
  });

  it("v3 → 1 year", () => {
    const start = new Date(Date.UTC(2025, 11, 1));
    const expiry = calcWarrantyExpiry("v3_2025_onwards", start)!;
    expect(expiry.getUTCFullYear()).toBe(2026);
  });
});

describe("evaluateWarranty", () => {
  it("v3 in-warranty product from serial", () => {
    // CR-4 produced week 50 of 2025 -> 2025/12 ish, expiry 2026/12
    const r = evaluateWarranty({ serialNumber: "CBK25500015", productModel: "CR-4" });
    expect(r.batch).toBe("v3_2025_onwards");
    expect(r.warrantyYears).toBe(1);
    expect(r.source).toBe("serial");
  });

  it("legacy batch flagged with note", () => {
    // CR-4 produced 2020 week 10
    const r = evaluateWarranty({ serialNumber: "CBK20100015", productModel: "CR-4" });
    expect(r.isLegacyBatch).toBe(true);
    expect(r.withinWarranty).toBe(false);
    expect(r.policyNote).toContain("2018–2022");
  });

  it("manual warranty override forces in_warranty", () => {
    const r = evaluateWarranty({
      serialNumber: "CBK20100015",
      productModel: "CR-4",
      manualWarrantyOverride: "in_warranty",
    });
    expect(r.withinWarranty).toBe(true);
    expect(r.isLegacyBatch).toBe(true); // batch 不變
  });

  it("manual batch override changes years", () => {
    const r = evaluateWarranty({
      serialNumber: "CBK25160015",
      productModel: "CR-4",
      manualBatchOverride: "v2_2022_2025",
    });
    expect(r.batch).toBe("v2_2022_2025");
    expect(r.warrantyYears).toBe(2);
    expect(r.source).toBe("manual_batch");
  });

  it("falls back to warranty_date when no serial", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const r = evaluateWarranty({
      warrantyDate: future.toISOString().slice(0, 10),
    });
    expect(r.withinWarranty).toBe(true);
    expect(r.source).toBe("warranty_date_field");
  });

  it("returns unknown when nothing provided", () => {
    const r = evaluateWarranty({});
    expect(r.batch).toBe("unknown");
    expect(r.withinWarranty).toBe(false);
  });
});
