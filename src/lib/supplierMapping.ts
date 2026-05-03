/**
 * 供應商映射表
 *
 * CR-4 / CR-1 → 創葆
 * CR-5 / CR-5L → 正能量
 * 其他型號（CR-F 等）→ 無預設，由 admin 手選
 */

export type SupplierKey = "chuangbao" | "zhengnengliang";

export const SUPPLIER_LABELS: Record<SupplierKey, string> = {
  chuangbao: "創葆",
  zhengnengliang: "正能量",
};

export const SUPPLIER_BADGE_CLASSES: Record<SupplierKey, string> = {
  chuangbao: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  zhengnengliang: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

export const PRODUCT_TO_SUPPLIER: Record<string, SupplierKey> = {
  "CR-4": "chuangbao",
  "CR-1": "chuangbao",
  "CR-5": "zhengnengliang",
  "CR-5L": "zhengnengliang",
};

/**
 * 依型號回傳預設供應商 key（找不到回 null）。
 * 比對忽略大小寫、空白、連字號。
 */
export function getDefaultSupplier(
  productModel: string | null | undefined
): SupplierKey | null {
  if (!productModel) return null;
  const normalize = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
  const target = normalize(productModel);
  for (const [key, supplier] of Object.entries(PRODUCT_TO_SUPPLIER)) {
    if (normalize(key) === target) return supplier;
  }
  return null;
}

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  pending_send: "待寄出",
  at_factory: "工廠維修中",
  repaired: "工廠完工",
  returned: "已驗收完成",
  scrapped: "報廢",
};

export const SUPPLIER_STATUS_BADGE: Record<string, string> = {
  pending_send: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  at_factory: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  repaired: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  returned: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  scrapped: "bg-red-100 text-red-800 hover:bg-red-100",
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "草稿（未寄出）",
  shipped: "已寄出 / 工廠中",
  received: "已收回",
};

export const BATCH_STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  shipped: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  received: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};

export const REFURB_INVENTORY_STATUS_LABELS: Record<string, string> = {
  in_stock: "在庫",
  used_warranty: "已撥用保固",
  sold: "已售出",
  scrapped: "報廢",
};

export const REFURB_INVENTORY_STATUS_BADGE: Record<string, string> = {
  in_stock: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  used_warranty: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  sold: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  scrapped: "bg-red-100 text-red-800 hover:bg-red-100",
};
