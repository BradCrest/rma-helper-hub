/**
 * CREST 保固政策模組（純函式，無副作用）
 *
 * 依據 2025/11/12 公告：
 *   https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update
 *
 * 三段批次：
 *   - 2018/01 – 2022/10：legacy 老批次，已不提供原廠維修（過保處理 + 特殊換購）
 *   - 2022/11 – 2025/10：v2，保固 2 年
 *   - 2025/11/12 起   ：v3，保固 1 年
 *
 * 序號規則（依官方序號查詢手冊）：
 *   - CR-4 / CR-1 ：第 4-5 碼為年（YY），第 6-7 碼為週數（WW）
 *   - CR-5L / CR-F：第 5-6 碼為年（YY），第 7-8 碼為週數（WW）
 *
 * 設計原則：保固到期日以「生產日期 + 保固年限」估算（無實際購買日時的合理近似）。
 */

export const POLICY_ANNOUNCEMENT_URL =
  "https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update";

export type ProductionBatch =
  | "legacy_2018_2022"
  | "v2_2022_2025"
  | "v3_2025_onwards"
  | "unknown";

export const BATCH_LABELS: Record<ProductionBatch, string> = {
  legacy_2018_2022: "Legacy（2018–2022）",
  v2_2022_2025: "V2（2022/11–2025/10）",
  v3_2025_onwards: "V3（2025/11+）",
  unknown: "未知批次",
};

interface SerialPattern {
  // 哪個位置是 YY、WW（0-indexed slice）
  yearSlice: [number, number];
  weekSlice: [number, number];
}

const SERIAL_PATTERNS: Record<string, SerialPattern> = {
  // CR-4: CBK25160015 -> 第4-5碼=year, 第6-7碼=week (1-indexed)
  "CR-4": { yearSlice: [3, 5], weekSlice: [5, 7] },
  // CR-1: CR125160015 -> 第4-5=year, 第6-7=week
  "CR-1": { yearSlice: [3, 5], weekSlice: [5, 7] },
  // CR-5L: 第5-6=year, 第7-8=week
  "CR-5L": { yearSlice: [4, 6], weekSlice: [6, 8] },
  // CR-F: CRFY25160015 -> 第5-6=year, 第7-8=week
  "CR-F": { yearSlice: [4, 6], weekSlice: [6, 8] },
};

function normalizeModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const target = model.toUpperCase().replace(/[\s-]/g, "");
  for (const key of Object.keys(SERIAL_PATTERNS)) {
    if (key.toUpperCase().replace(/[\s-]/g, "") === target) return key;
  }
  return null;
}

/**
 * 將 ISO 週數轉為該週週一日期（近似生產日）。
 * year: 4 位數年；week: 1-53。
 */
function isoWeekToDate(year: number, week: number): Date {
  // ISO 週：每年 1/4 必在第 1 週
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 週一=1, 週日=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

export interface ParsedSerial {
  year: number;
  week: number;
  productionDate: Date;
}

/**
 * 從序號解析年份+週數+大約生產日期。失敗回傳 null。
 */
export function parseSerialNumber(
  serial: string | null | undefined,
  productModel: string | null | undefined
): ParsedSerial | null {
  if (!serial || !productModel) return null;
  const cleaned = serial.trim().toUpperCase().replace(/\s+/g, "");
  const normalizedModel = normalizeModel(productModel);
  if (!normalizedModel) return null;
  const pattern = SERIAL_PATTERNS[normalizedModel];
  if (cleaned.length < pattern.weekSlice[1]) return null;

  const yearStr = cleaned.slice(pattern.yearSlice[0], pattern.yearSlice[1]);
  const weekStr = cleaned.slice(pattern.weekSlice[0], pattern.weekSlice[1]);
  const yy = parseInt(yearStr, 10);
  const ww = parseInt(weekStr, 10);
  if (isNaN(yy) || isNaN(ww)) return null;
  if (ww < 1 || ww > 53) return null;
  // 假設 18-99 -> 2018-2099；00-17 -> 2100+ 不合理 → reject
  if (yy < 18 || yy > 99) return null;
  const fullYear = 2000 + yy;
  const productionDate = isoWeekToDate(fullYear, ww);
  return { year: fullYear, week: ww, productionDate };
}

/**
 * 由生產日期推三段批次。
 * 邊界：
 *   - < 2022/11/01 → legacy
 *   - 2022/11/01 – 2025/11/11 → v2
 *   - >= 2025/11/12 → v3
 */
export function detectBatch(productionDate: Date): ProductionBatch {
  const ts = productionDate.getTime();
  const v2Start = Date.UTC(2022, 10, 1); // 2022/11/01
  const v3Start = Date.UTC(2025, 10, 12); // 2025/11/12
  if (ts < v2Start) return "legacy_2018_2022";
  if (ts < v3Start) return "v2_2022_2025";
  return "v3_2025_onwards";
}

/**
 * 由批次 + 生產日推保固到期。legacy 無保固 → null。
 */
export function calcWarrantyExpiry(
  batch: ProductionBatch,
  productionDate: Date
): Date | null {
  if (batch === "legacy_2018_2022" || batch === "unknown") return null;
  const years = batch === "v2_2022_2025" ? 2 : 1;
  const expiry = new Date(productionDate);
  expiry.setFullYear(expiry.getFullYear() + years);
  return expiry;
}

export interface WarrantyDecision {
  batch: ProductionBatch;
  withinWarranty: boolean;
  isLegacyBatch: boolean;
  warrantyYears: 1 | 2 | null;
  productionDate: Date | null;
  expiry: Date | null;
  source: "serial" | "manual_batch" | "warranty_date_field" | "none";
  policyNote: string;
  parsed: ParsedSerial | null;
}

/**
 * 完整保固評估。優先順序：
 *   1. manualWarrantyOverride（admin 強制標示在保 / 過保）
 *   2. manualBatchOverride + 序號生產日 → 重算
 *   3. 序號解析
 *   4. warranty_date 欄位 fallback
 */
export function evaluateWarranty(params: {
  serialNumber?: string | null;
  productModel?: string | null;
  warrantyDate?: string | null;
  manualBatchOverride?: ProductionBatch | null;
  manualWarrantyOverride?: "in_warranty" | "out_of_warranty" | null;
}): WarrantyDecision {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsed = parseSerialNumber(params.serialNumber, params.productModel);

  let batch: ProductionBatch = "unknown";
  let productionDate: Date | null = null;
  let source: WarrantyDecision["source"] = "none";

  if (parsed) {
    productionDate = parsed.productionDate;
    batch = detectBatch(parsed.productionDate);
    source = "serial";
  }

  if (params.manualBatchOverride) {
    batch = params.manualBatchOverride;
    source = "manual_batch";
  }

  let expiry: Date | null = productionDate
    ? calcWarrantyExpiry(batch, productionDate)
    : null;

  // warranty_date 欄位 fallback（手動填入比序號可信）
  if (!expiry && params.warrantyDate) {
    expiry = new Date(params.warrantyDate);
    if (source === "none") source = "warranty_date_field";
  }

  let withinWarranty = expiry ? expiry >= today : false;

  // 強制覆寫
  if (params.manualWarrantyOverride === "in_warranty") {
    withinWarranty = true;
  } else if (params.manualWarrantyOverride === "out_of_warranty") {
    withinWarranty = false;
  }

  const isLegacyBatch = batch === "legacy_2018_2022";
  const warrantyYears: 1 | 2 | null =
    batch === "v2_2022_2025" ? 2 : batch === "v3_2025_onwards" ? 1 : null;

  let policyNote = "";
  if (isLegacyBatch) {
    policyNote =
      "此為 2018–2022 老批次，依 2025/11/12 公告已不提供原廠維修，僅提供特殊換購方案。";
  } else if (batch === "v2_2022_2025") {
    policyNote = "V2 批次：保固 2 年。";
  } else if (batch === "v3_2025_onwards") {
    policyNote = "V3 批次：保固 1 年。";
  } else {
    policyNote = "無法自動判斷批次，請依購買憑證或手動指定。";
  }

  return {
    batch,
    withinWarranty,
    isLegacyBatch,
    warrantyYears,
    productionDate,
    expiry,
    source,
    policyNote,
    parsed,
  };
}

export function formatBatchBadge(batch: ProductionBatch): string {
  return BATCH_LABELS[batch];
}
