import { describe, it, expect } from "vitest";
import {
  parseCSVWithDiagnostics,
  parseCSV,
  validateRecord,
  getParseStats,
} from "./csvParser";

// 最小有效 CSV（只有 header + 一筆資料）
const HEADER = "報修單號,狀態,收件日期,身分,姓名,電話,手機,EMAIL,地址,社群,物流,物流單號,型號,序號,問題,初步判定,分類,問題描述,備註,購買日期,保固日期,聯繫日期,聯繫內容,預計方法,預估費用,實際方法,實際費用,替換型號,替換序號,內部單號,寄回日期,寄回物流,寄回單號,維修需求,供應商狀態,送廠日期,送廠物流,送廠單號,供應商保固,生產批次,工廠分析,工廠方法,工廠費用,工廠返回,檢測結果,維修次數,收到處理,追蹤日期,追蹤方式,滿意度,意見";

function makeRow(overrides: Partial<Record<number, string>> = {}): string {
  const cols = Array(51).fill("");
  cols[0] = "RMA-2024-001";   // rma_number
  cols[1] = "已登記";          // status
  cols[4] = "王小明";          // customer_name
  cols[5] = "0912345678";     // customer_phone
  cols[7] = "test@example.com"; // customer_email
  Object.entries(overrides).forEach(([idx, val]) => {
    cols[Number(idx)] = val;
  });
  return cols.join(",");
}

describe("parseCSVWithDiagnostics", () => {
  it("正常一筆資料應解析成功", () => {
    const csv = [HEADER, makeRow()].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.records[0].rma_number).toBe("RMA-2024-001");
  });

  it("status 中文應正確對應英文 enum", () => {
    const csv = [HEADER, makeRow({ 1: "已收件" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].status).toBe("received");
  });

  it("未知 status 應 fallback 到 registered", () => {
    const csv = [HEADER, makeRow({ 1: "不明狀態" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].status).toBe("registered");
  });

  it("「維修中」應被 skip 並附上原因說明，不得匯入為 repairing", () => {
    const csv = [HEADER, makeRow({ 1: "維修中" })].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("維修中");
  });

  it("「原錶維修中」應被 skip 並附上原因說明，不得匯入為 repairing", () => {
    const csv = [HEADER, makeRow({ 1: "原錶維修中" })].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("原錶維修中");
  });

  it("缺少 rma_number 應被跳過並記錄原因", () => {
    const csv = [HEADER, makeRow({ 0: "" })].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("報修單號");
  });

  it("NA 在 rma_number 欄位應被跳過", () => {
    const csv = [HEADER, makeRow({ 0: "NA" })].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(0);
  });

  it("多筆資料應全部解析", () => {
    const row2 = makeRow({ 0: "RMA-2024-002" });
    const csv = [HEADER, makeRow(), row2].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records).toHaveLength(2);
  });

  it("空白行應被跳過", () => {
    const csv = [HEADER, makeRow(), ""].join("\n");
    const result = parseCSVWithDiagnostics(csv);
    expect(result.records).toHaveLength(1);
  });

  it("totalLines 不包含 header", () => {
    const csv = [HEADER, makeRow(), makeRow({ 0: "RMA-2024-002" })].join("\n");
    const { totalLines } = parseCSVWithDiagnostics(csv);
    expect(totalLines).toBe(2);
  });
});

describe("日期解析", () => {
  it("YYYY/MM/DD 格式應正確轉換", () => {
    const csv = [HEADER, makeRow({ 2: "2024/01/05" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].received_date).toBe("2024-01-05");
  });

  it("YYYY-MM-DD 格式應正確轉換", () => {
    const csv = [HEADER, makeRow({ 2: "2024-1-5" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].received_date).toBe("2024-01-05");
  });

  it("MM/DD/YYYY 格式應正確轉換", () => {
    const csv = [HEADER, makeRow({ 2: "01/05/2024" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].received_date).toBe("2024-01-05");
  });

  it("NA 日期應回傳 null", () => {
    const csv = [HEADER, makeRow({ 2: "NA" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].received_date).toBeNull();
  });

  it("空日期應回傳 null", () => {
    const csv = [HEADER, makeRow({ 2: "" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].received_date).toBeNull();
  });
});

describe("數字解析", () => {
  it("整數費用應正確解析", () => {
    const csv = [HEADER, makeRow({ 24: "1500" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].estimated_cost).toBe(1500);
  });

  it("含逗號的數字在 CSV 引號內應正確解析", () => {
    // CSV 規則：含逗號的值必須用雙引號包住，否則會被拆成多欄
    const csv = [HEADER, makeRow({ 24: '"1,500"' })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].estimated_cost).toBe(1500);
  });

  it("NA 費用應回傳 null", () => {
    const csv = [HEADER, makeRow({ 24: "NA" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    expect(records[0].estimated_cost).toBeNull();
  });
});

describe("validateRecord", () => {
  it("完整資料應通過驗證", () => {
    const csv = [HEADER, makeRow()].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    const { valid, errors } = validateRecord(records[0]);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("缺少 customer_name 應驗證失敗", () => {
    const csv = [HEADER, makeRow({ 4: "" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    const { valid, errors } = validateRecord(records[0]);
    expect(valid).toBe(false);
    expect(errors).toContain("缺少客戶姓名");
  });
});

describe("getParseStats", () => {
  it("應正確統計 valid / invalid 筆數", () => {
    const csv = [HEADER, makeRow(), makeRow({ 0: "RMA-002", 4: "" })].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    const stats = getParseStats(records);
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(1);
    expect(stats.invalid).toBe(1);
  });

  it("byStatus 應正確分類", () => {
    const row2 = makeRow({ 0: "RMA-002", 1: "已收件" });
    const csv = [HEADER, makeRow(), row2].join("\n");
    const { records } = parseCSVWithDiagnostics(csv);
    const stats = getParseStats(records);
    expect(stats.byStatus["registered"]).toBe(1);
    expect(stats.byStatus["received"]).toBe(1);
  });
});

describe("parseCSV（舊版 API）", () => {
  it("應回傳與 parseCSVWithDiagnostics 相同的 records", () => {
    const csv = [HEADER, makeRow()].join("\n");
    const legacy = parseCSV(csv);
    const { records } = parseCSVWithDiagnostics(csv);
    expect(legacy).toEqual(records);
  });
});
