import { describe, it, expect } from "vitest";
import { getDefaultSupplier, SUPPLIER_LABELS } from "./supplierMapping";

describe("getDefaultSupplier", () => {
  it("returns chuangbao for CR-4 variants", () => {
    expect(getDefaultSupplier("CR-4")).toBe("chuangbao");
    expect(getDefaultSupplier("cr-4")).toBe("chuangbao");
    expect(getDefaultSupplier("cr4")).toBe("chuangbao");
    expect(getDefaultSupplier("CR 4")).toBe("chuangbao");
  });

  it("returns chuangbao for CR-1", () => {
    expect(getDefaultSupplier("CR-1")).toBe("chuangbao");
  });

  it("returns zhengnengliang for CR-5 / CR-5L variants", () => {
    expect(getDefaultSupplier("CR-5")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR-5L")).toBe("zhengnengliang");
    expect(getDefaultSupplier("cr5l")).toBe("zhengnengliang");
    expect(getDefaultSupplier("CR 5L")).toBe("zhengnengliang");
  });

  it("returns null for unknown / empty model", () => {
    expect(getDefaultSupplier("CR-F")).toBeNull();
    expect(getDefaultSupplier(null)).toBeNull();
    expect(getDefaultSupplier(undefined)).toBeNull();
    expect(getDefaultSupplier("")).toBeNull();
  });

  it("supplier labels are correct Chinese names", () => {
    expect(SUPPLIER_LABELS.chuangbao).toBe("創葆");
    expect(SUPPLIER_LABELS.zhengnengliang).toBe("正能量");
  });
});
