
# 供應商維修追蹤 + 整新品庫存（整合版）

依你的調整，以下是最終實作計劃。

---

## Step 1：Migration（新建）

```sql
-- 1a. rma_supplier_repairs 補欄位
ALTER TABLE rma_supplier_repairs
  ADD COLUMN IF NOT EXISTS supplier_name                 text,
  ADD COLUMN IF NOT EXISTS factory_repair_cost_estimated numeric(10,2),
  ADD COLUMN IF NOT EXISTS invoice_reference             text;
-- factory_repair_cost 保留為實際費用

-- 1b. 批次表（多台機器一次寄出）
CREATE TABLE IF NOT EXISTS supplier_repair_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name       text NOT NULL,
  status              text NOT NULL DEFAULT 'draft',
                      -- draft | shipped | received
  shipped_at          timestamptz,
  tracking_number_out text,
  expected_return_at  date,
  received_at         timestamptz,
  tracking_number_in  text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rma_supplier_repairs
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES supplier_repair_batches(id) ON DELETE SET NULL;

-- 1c. 整新品庫存表
CREATE TABLE IF NOT EXISTS refurbished_inventory (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_model             text NOT NULL,
  serial_number             text,
  grade                     text NOT NULL CHECK (grade IN ('A','B','C')),
  source_rma_id             uuid REFERENCES rma_requests(id)         ON DELETE SET NULL,
  source_supplier_repair_id uuid REFERENCES rma_supplier_repairs(id) ON DELETE SET NULL,
  cost                      numeric(10,2),
  status                    text NOT NULL DEFAULT 'in_stock',
                            -- in_stock | used_warranty | sold | scrapped
  used_for_rma_id           uuid REFERENCES rma_requests(id) ON DELETE SET NULL,
  notes                     text,
  received_date             date NOT NULL DEFAULT current_date,
  released_date             date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- RLS（沿用 is_admin(auth.uid()) 模式，與既有表一致）
ALTER TABLE supplier_repair_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE refurbished_inventory    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view supplier batches"   ON supplier_repair_batches FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert supplier batches" ON supplier_repair_batches FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update supplier batches" ON supplier_repair_batches FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete supplier batches" ON supplier_repair_batches FOR DELETE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view refurb inventory"   ON refurbished_inventory FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert refurb inventory" ON refurbished_inventory FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update refurb inventory" ON refurbished_inventory FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete refurb inventory" ON refurbished_inventory FOR DELETE USING (is_admin(auth.uid()));
```

---

## Step 2：`src/lib/supplierMapping.ts`（純函式）

```ts
export type SupplierKey = 'chuangbao' | 'zhengnengliang';

export const SUPPLIER_LABELS: Record<SupplierKey, string> = {
  chuangbao:      '創葆',
  zhengnengliang: '正能量',
};

export const PRODUCT_TO_SUPPLIER: Record<string, SupplierKey> = {
  'CR-4':  'chuangbao',
  'CR-1':  'chuangbao',
  'CR-5':  'zhengnengliang',
  'CR-5L': 'zhengnengliang',
  // CR-F：無預設，admin 手選
};

export function getDefaultSupplier(productModel: string | null | undefined): SupplierKey | null {
  if (!productModel) return null;
  const normalized = productModel.trim().toUpperCase().replace(/\s|-/g, '');
  for (const [key, supplier] of Object.entries(PRODUCT_TO_SUPPLIER)) {
    if (key.replace(/-/g, '') === normalized) return supplier;
  }
  return null;
}
```

附 vitest 單元測試覆蓋大小寫、空白、CR5L/cr-5l 變體。

---

## Step 3：`FaultRegistrationDialog.tsx` 修改

當處置決策 = `supplier_repair` 送出時：

1. 自動帶入 `supplier_name`（依型號呼叫 `getDefaultSupplier()`，UI 提供下拉可覆寫）
2. 直接 insert `rma_supplier_repairs`（admin 透過 RLS）：
   - `supplier_status: 'pending_send'`
   - `supplier_name`
   - `repair_requirement`（從 fault description 帶入）
   - `repair_count`：先 `select count(*) where rma_request_id = ?` 再 +1
3. RMA 狀態維持 `inspecting`
4. Toast：「已建立送修單，請至『供應商維修』分頁追蹤進度」

---

## Step 4：`SupplierRepairTab.tsx`

兩個 sub-tab：

### Sub-tab A：送修追蹤

**頂部篩選列**：文字搜尋 / 供應商篩選 / 狀態篩選 / 「逾期未回（>30 天）」toggle

**批次管理 panel**（折疊，預設展開 draft + shipped）：
- 卡片：供應商、台數、狀態、操作
- 「建立新批次」→ 選供應商 → 從同供應商 `pending_send` 工單勾選加入
- 「標記已出貨」：填出貨日 / 快遞 / 追蹤號 → batch `shipped` + 該批次工單全部 → `at_factory`
- 「標記已收回」：填收回日 / 回程追蹤號 → batch `received` + 該批次工單全部 → `repaired`

**表格欄位**：RMA / 客戶 / 型號 / 序號 / 供應商 badge / 狀態 badge / 送出日 / 在外天數 / 預估費 / 實際費 / 操作

供應商 badge：創葆藍、正能量綠

操作：「檢視 / 更新」→ 開啟 `SupplierRepairDialog`

### Sub-tab B：整新品庫存

**頂部 summary cards**：每型號（CR-4 / CR-1 / CR-5 / CR-5L）顯示 A/B/C 在庫數量

**表格**：型號 / 序號 / 等級 badge / 來源 RMA / 成本 / 狀態 / 入庫日 / 操作

**操作（in_stock 才顯示）**：
- 撥用保固：輸入目標 RMA 編號 → `used_warranty` + `used_for_rma_id` + `released_date`
- 標記出售：填售價日期 → `sold`
- 報廢：填原因 → `scrapped`

---

## Step 5：`SupplierRepairDialog.tsx`（階段式）

完成的區塊 collapse 但保留記錄。

### 階段 1：寄出（`pending_send`）
供應商下拉、維修需求、預估費、送出日 / 快遞 / 追蹤號  
按鈕：「加入批次出貨」或「單獨標記已寄出」→ `at_factory`

### 階段 2：工廠維修中（`at_factory`）
factory_analysis / factory_repair_method / factory_repair_cost / invoice_reference / supplier_warranty_date / production_batch  
按鈕：「工廠完成維修」→ `repaired`

### 階段 3：回廠驗收（`repaired`）
inspection_result + 後續處置 RadioGroup：
- `add_to_refurb_stock` → 顯示等級選擇 A/B/C → 寫入 `refurbished_inventory`（cost 自動帶 `factory_repair_cost`），supplier_status → `returned`
- `return_to_customer` → RMA 回 `inspecting`，supplier_status → `returned`
- `scrap` → 填原因，supplier_status → `scrapped`

底部歷史記錄：依 `repair_count` 排列時間軸（同一 RMA 多次送修）

---

## Step 6：`AdminLogistics.tsx`

```tsx
{ id: "supplier", label: "供應商維修", icon: Factory },  // 移除 disabled

<TabsContent value="supplier" className="mt-0">
  <SupplierRepairTab />
</TabsContent>
```

---

## Step 7：`AdminDashboard.tsx`（選做，這次一併做）

兩張卡片：
- **在外維修中**：`rma_supplier_repairs` WHERE supplier_status IN ('at_factory','repaired')
- **整新品庫存**：`refurbished_inventory` WHERE status = 'in_stock' GROUP BY grade

---

## 不做的事

1. 自動配對庫存到處置決策（手動撥用即可）
2. 成本毛利報表（資料先存好）
3. 庫存照片（用 rma-photos bucket，不做新 bucket）
4. 供應商表單 normalization（先 hardcode 兩家 + 自由輸入）

---

## 檔案異動清單

**新增**
- migration（補欄位 + 兩張新表 + RLS）
- `src/lib/supplierMapping.ts` + `.test.ts`
- `src/components/logistics/SupplierRepairTab.tsx`
- `src/components/logistics/SupplierRepairDialog.tsx`
- `src/components/logistics/SupplierBatchPanel.tsx`
- `src/components/logistics/RefurbishedInventoryPanel.tsx`

**修改**
- `src/pages/AdminLogistics.tsx`（啟用 supplier 分頁）
- `src/components/logistics/FaultRegistrationDialog.tsx`（送出 supplier_repair 時建立 supplier_repair 列）
- `src/pages/AdminDashboard.tsx`（兩張統計卡）

確認後我就開工。
