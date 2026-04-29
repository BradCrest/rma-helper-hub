import { describe, it, expect } from "vitest";
import { isInvalidSerialNumber } from "./serialNumberValidator";

describe("isInvalidSerialNumber", () => {
  // 有效序號（應回傳 false = 不是無效序號）
  it("正常產品序號應回傳 false", () => {
    expect(isInvalidSerialNumber("ABC123456")).toBe(false);
  });

  it("空字串應回傳 false", () => {
    expect(isInvalidSerialNumber("")).toBe(false);
  });

  // EN13319 歐盟潛水標準
  it("EN 開頭應回傳 true", () => {
    expect(isInvalidSerialNumber("EN13319")).toBe(true);
  });

  it("小寫 en 開頭也應回傳 true（不分大小寫）", () => {
    expect(isInvalidSerialNumber("en13319")).toBe(true);
  });

  it("包含 13319 字串應回傳 true", () => {
    expect(isInvalidSerialNumber("XYZ13319ABC")).toBe(true);
  });

  it("EN 開頭加空格應回傳 true", () => {
    expect(isInvalidSerialNumber("EN 13319")).toBe(true);
  });

  it("EN 開頭加連字號應回傳 true", () => {
    expect(isInvalidSerialNumber("EN-13319")).toBe(true);
  });

  // NCC 核准號（CCA 開頭）
  it("CCA 開頭應回傳 true", () => {
    expect(isInvalidSerialNumber("CCA-1234567890")).toBe(true);
  });

  it("小寫 cca 開頭也應回傳 true（不分大小寫）", () => {
    expect(isInvalidSerialNumber("cca12345")).toBe(true);
  });

  it("CCA 開頭加空格應回傳 true", () => {
    expect(isInvalidSerialNumber("CCA 12345")).toBe(true);
  });
});
