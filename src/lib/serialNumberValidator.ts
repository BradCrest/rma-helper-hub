/**
 * Detect serial numbers that are actually NOT product serial numbers,
 * but commonly mistaken inputs like:
 *  - EN13319 (EU diving standard)
 *  - NCC approval codes starting with CCA
 */

export function isInvalidSerialNumber(value: string): boolean {
  if (!value) return false;
  const normalized = value.toUpperCase().replace(/[\s\-]/g, "");
  if (!normalized) return false;

  if (normalized.startsWith("EN")) return true;
  if (normalized.includes("13319")) return true;
  if (normalized.startsWith("CCA")) return true;

  return false;
}

export const INVALID_SERIAL_TITLE = "這不是產品序號";
export const INVALID_SERIAL_DESCRIPTION =
  "您輸入的看起來是「歐盟潛水標準（EN13319）」或「NCC 核准號（CCA 開頭）」，並非產品序號。\n\n✅ 產品序號可在以下位置找到：\n・產品包裝盒上的標籤\n・錶身背面的刻印\n\n請重新確認後再填寫，謝謝。";
