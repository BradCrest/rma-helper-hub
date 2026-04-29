/**
 * 整新機價格表
 *
 * 維護方式：直接編輯本檔案的 REFURB_PRICES。新型號上線時加一行即可。
 * 未列在表中的型號 → 回傳 0，admin 在 UI 中可手動覆寫。
 */

export interface RefurbPriceTier {
  A: number;
  B: number;
  C: number;
}

export const REFURB_PRICES: Record<string, RefurbPriceTier> = {
  "CR-4": { A: 3680, B: 3180, C: 2680 },
  "CR-5L": { A: 5780, B: 5180, C: 4580 },
};

export const DEFAULT_REFURB_PRICES: RefurbPriceTier = { A: 0, B: 0, C: 0 };

/**
 * 模糊比對產品型號取得價格表。
 * 比對時忽略空白與連字號、不分大小寫，例如 "CR-5L"、"cr5l"、"CR 5L" 視為同型號。
 */
export function getRefurbPrices(productModel: string | null | undefined): RefurbPriceTier {
  if (!productModel) return DEFAULT_REFURB_PRICES;
  const normalize = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
  const target = normalize(productModel);
  for (const [key, prices] of Object.entries(REFURB_PRICES)) {
    if (normalize(key) === target) return prices;
  }
  return DEFAULT_REFURB_PRICES;
}

/**
 * actual_method 統一字串標識。
 * 寫入 rma_repair_details.actual_method，後續寄回階段依此決定寄回類型。
 */
export type ActualMethod =
  | "warranty_replace"
  | "purchase_a"
  | "purchase_b"
  | "purchase_c"
  | "return_original";

export const ACTUAL_METHOD_LABELS: Record<ActualMethod, string> = {
  warranty_replace: "保固換整新機",
  purchase_a: "購買 A 級整新機",
  purchase_b: "購買 B 級整新機",
  purchase_c: "購買 C 級整新機",
  return_original: "原錶退回",
};

/**
 * 依據保固日期判斷是否仍在保固內。
 * warranty_date 為空時視為未保固。
 */
export function isWithinWarranty(warrantyDate: string | null | undefined): boolean {
  if (!warrantyDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(warrantyDate);
  return expiry >= today;
}

/**
 * 金額格式化為 NT$ 顯示。
 */
export function formatNT(amount: number): string {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

/**
 * 公告連結（2025/11/12 保固維修政策調整）
 */
export const POLICY_ANNOUNCEMENT_URL =
  "https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update";

/**
 * 產生診斷通知 email 預設文字。
 * - 保固內：免費換整新機
 * - 過保固：列出 ABC 三級價格 + 原錶退回
 * - Legacy 批次（過保 + isLegacyBatch=true）：開頭多一段政策說明
 * 所有過保版本最後附上官方政策公告連結。
 */
export function buildDiagnosisNotificationBody(params: {
  productModel: string | null | undefined;
  serialNumber: string | null | undefined;
  withinWarranty: boolean;
  diagnosis?: string | null;
  isLegacyBatch?: boolean;
}): string {
  const { productModel, serialNumber, withinWarranty, diagnosis, isLegacyBatch } = params;
  const productLabel = productModel || "您的產品";
  const serialLabel = serialNumber ? `（序號 ${serialNumber}）` : "";
  const diagnosisLine = diagnosis
    ? `\n檢測結果：${diagnosis}\n`
    : "";

  if (withinWarranty) {
    return `您好，

您的 ${productLabel}${serialLabel} 已完成檢測，確認符合保固更換條件。
${diagnosisLine}
我們將為您更換整新機（免費），請回覆此信件確認接受，我們將盡快安排寄出。

CREST 售後服務團隊`;
  }

  const prices = getRefurbPrices(productModel);
  const intro = isLegacyBatch
    ? `您的 ${productLabel}${serialLabel} 為 2018–2022 生產批次，依本公司 2025/11/12 公告，此批次已不提供原廠維修。我們提供以下特殊換購方案：`
    : `您的 ${productLabel}${serialLabel} 已完成檢測，非保固範圍。`;

  return `您好，

${intro}
${diagnosisLine}
以下為可選方案，請回覆此信件告知您的選擇：

  • A 級整新機：${formatNT(prices.A)}
  • B 級整新機：${formatNT(prices.B)}
  • C 級整新機：${formatNT(prices.C)}
  • 原錶退回：免費（僅需負擔回寄運費）

詳細政策請參閱：${POLICY_ANNOUNCEMENT_URL}

CREST 售後服務團隊`;
}
