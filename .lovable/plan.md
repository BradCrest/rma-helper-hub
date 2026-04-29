
# 對齊 CREST 官方保固政策（精簡版 + 序號自動解析）

## 三個確認事項回覆

| 確認事項 | 答案 |
|---|---|
| Legacy 批次定價 | 與一般過保相同 A/B/C 價格，UI 加文字備註即可 |
| 批次判斷 | **可從序號解析**（CR-4 / CR-5L / CR-1 / CR-F 都含年份+週數）|
| 公告連結 | Email 模板 + 客戶 tracking 頁 |

## CREST 序號規則（官方文件）

| 型號 | 範例 | 年份位置 | 週數位置 |
|---|---|---|---|
| CR-4  | `CBK25160015` | 第 4-5 碼 (`25` = 2025) | 第 6-7 碼 (`16` = 第 16 週) |
| CR-5L | `CBK25160015` | 第 5-6 碼 | 第 7-8 碼 |
| CR-1  | `CR125160015` | 第 4-5 碼 | 第 6-7 碼 |
| CR-F  | `CRFY25160015`| 第 5-6 碼 | 第 7-8 碼 |

→ `生產年 + 週數` 可推得「大約生產日期」→ 比對政策三段制 → 自動算保固到期日。

## 政策對應

| 生產日期 | 保固年限 | 備註 |
|---|---|---|
| 2018/01 – 2022/10 | **無**（過保） | UI 顯示「老批次」備註 + 沿用 A/B/C 價 |
| 2022/11 – 2025/10 | **2 年** | 一般保固流程 |
| 2025/11/12 起 | **1 年** | 一般保固流程 |

---

## 實作計劃（精簡為兩個 Phase）

### Phase 1 — 純函式模組（高優先）

**新建 `src/lib/warrantyPolicy.ts`** — 純函式，易測試
```typescript
export type ProductionBatch = "legacy_2018_2022" | "v2_2022_2025" | "v3_2025_onwards";

// 從序號解析生產日期（年+週數轉日期）
export function parseSerialNumber(serial: string, model: string): {
  year: number;
  week: number;
  productionDate: Date;
} | null;

// 由生產日期推批次
export function detectBatch(productionDate: Date): ProductionBatch;

// 由批次 + 生產日推保固到期日
export function calcWarrantyExpiry(batch: ProductionBatch, productionDate: Date): Date | null;

// 完整評估（給 UI 用）
export interface WarrantyDecision {
  batch: ProductionBatch;
  withinWarranty: boolean;
  isLegacyBatch: boolean;
  warrantyYears: 1 | 2 | null;
  productionDate: Date | null;
  expiry: Date | null;
  source: "serial" | "manual" | "warranty_date_field";
  policyNote: string;
}
export function evaluateWarranty(params: {
  serialNumber?: string | null;
  productModel?: string | null;
  warrantyDate?: string | null;
  manualBatchOverride?: ProductionBatch | null;
  manualWarrantyOverride?: "in_warranty" | "out_of_warranty" | null;
}): WarrantyDecision;

export const POLICY_ANNOUNCEMENT_URL = "https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update";
```

**新建 `src/lib/warrantyPolicy.test.ts`** — 單元測試
- CR-4 / CR-5L / CR-1 / CR-F 序號各 3-5 個樣本
- 三段批次邊界日期（2022/10/31、2022/11/01、2025/10/31、2025/11/12）
- 缺序號 / 缺型號 fallback 行為

### Phase 2 — UI 整合

**A. `WarrantyCalculator.tsx`（嵌在 ReceivingTab 收件 Dialog）**
- 自動讀取該 RMA 的 `serial_number` + `product_model`
- 顯示：`從序號 CBK25160015 解析 → 2025/04/15 生產 → 第 3 段批次（2025/11+）→ 保固 1 年 → 到期日 2026/04/15`
- Admin 可手動覆寫批次（下拉三選一）
- 「套用到此 RMA」按鈕 → 寫入 `warranty_date` + `warranty_status`

**B. `ReceivingTab.tsx` 診斷通知 Dialog**
- 保固區塊顯示批次徽章 + 解析來源（從序號 / 手動）
- 若 `isLegacyBatch` → 顯示警示橫幅：「此產品為 2018–2022 批次，依 2025/11/12 公告已不提供原廠維修，可走特殊換購方案」

**C. `AwaitingConfirmationTab.tsx` — 保留現有兩種模式**
- ✅ 保固內 → 一鍵「換整新機」（不變）
- ⚠️ 過保 → A/B/C + 原錶退回（不變）；若是 legacy 批次，**只在過保區塊頂部加一段灰色備註**：「此為 2018–2022 老批次，依公告為特殊換購方案」

**D. 過保 Email 模板（`refurbishedPricing.ts`）**
- 在 `buildDiagnosisNotificationBody` 過保版本最後加入：
  ```
  詳細政策請參閱：https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update
  ```
- 若 `isLegacyBatch`，第一段改為「您的產品為 2018–2022 批次，依公告政策已不提供原廠維修，以下為特殊換購方案」

**E. 客戶 tracking 頁（`Track.tsx` 或 RMA 詳情顯示處）**
- 在保固狀態旁加小字連結：「📋 查看保固政策」→ 開新分頁到公告

---

## 不在本次範圍（依 Claude 建議精簡）

- ❌ DB migration 加 `production_batch` 欄位（warranty_date 算對就夠用）
- ❌ 第三種獨立 UI 模式（legacy 只是過保 + 備註，不另開分支）
- ❌ Legacy 獨立價格表（沿用 A/B/C）

## 檔案異動清單

| 檔案 | 動作 |
|---|---|
| `src/lib/warrantyPolicy.ts` | 新建 |
| `src/lib/warrantyPolicy.test.ts` | 新建 |
| `src/components/logistics/WarrantyCalculator.tsx` | 新建 |
| `src/components/logistics/ReceivingTab.tsx` | 嵌入 Calculator + legacy 警示 |
| `src/components/logistics/AwaitingConfirmationTab.tsx` | 過保區加 legacy 備註 |
| `src/lib/refurbishedPricing.ts` | Email 模板加公告連結 + legacy 變體 |
| `src/pages/Track.tsx` | 加政策連結 |

確認後依此順序實作。
