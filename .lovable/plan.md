# 待客戶確認流程 — 整合方案（採納 Claude 建議）

## 兩方案比較

| 項目 | 原計劃 | Claude 建議 | 採用 |
|------|--------|-------------|------|
| 價格表儲存 | DB (`ai_settings`) + 設定頁 | 前端硬編碼常數 | **Claude** — 更簡單，不用建設定 UI |
| `actual_method` 命名 | `purchased_refurbished_a` | `purchase_a` | **Claude** — 更簡潔 |
| 依產品分價 | 全產品共用一組價格 | 各型號獨立價格 (CR-4 / CR-5L) | **Claude** — 符合實況 |
| Email 內容 | 未提 | 依保固狀態自動切換 | **Claude 補強** |
| 待客戶確認分頁 | 完整設計 | 未提 | **保留原計劃** |
| 保固判斷 + 手動覆寫 | 有 | 未提 | **保留原計劃** |
| 訊息時間軸 + 4 選項決定 UI | 有 | 未提 | **保留原計劃** |

---

## Phase A — 價格表常數

新建 `src/lib/refurbishedPricing.ts`：

```typescript
export const REFURB_PRICES: Record<string, { A: number; B: number; C: number }> = {
  "CR-4":  { A: 3680, B: 3180, C: 2680 },
  "CR-5L": { A: 5780, B: 5180, C: 4580 },
};

export const DEFAULT_REFURB_PRICES = { A: 0, B: 0, C: 0 };

export function getRefurbPrices(productModel: string | null | undefined) {
  if (!productModel) return DEFAULT_REFURB_PRICES;
  // 模糊比對：CR-5L、CR5L、cr-5l 都可
  const normalized = productModel.toUpperCase().replace(/[\s-]/g, "");
  for (const [key, prices] of Object.entries(REFURB_PRICES)) {
    if (key.toUpperCase().replace(/[\s-]/g, "") === normalized) return prices;
  }
  return DEFAULT_REFURB_PRICES;
}

export const ACTUAL_METHOD_LABELS: Record<string, string> = {
  warranty_replace: "保固換整新機",
  purchase_a: "購買 A 級整新機",
  purchase_b: "購買 B 級整新機",
  purchase_c: "購買 C 級整新機",
  return_original: "原錶退回",
};
```

未列在 `REFURB_PRICES` 的型號 → 顯示 0，admin 可在 Dialog 中手動填入。新型號上線時直接改這支檔即可。

---

## Phase B — 診斷通知 Email 動態化（ReceivingTab）

修改現有「通知客戶診斷結果」的預設文字，依 `warranty_date >= today` 切換：

**保固內模板**：
```
您好，

您的 {product_model}（序號 {serial_number}）已完成檢測，
確認符合保固更換條件。我們將為您更換整新機（免費）。

請回覆此信件確認接受，我們將盡快安排寄出。

CREST 售後服務團隊
```

**過保固模板**（自動帶入該型號 ABC 價格）：
```
您好，

您的 {product_model}（序號 {serial_number}）已完成檢測，
非保固範圍。以下為可選方案：

  A 級整新機：NT$ {price_a}
  B 級整新機：NT$ {price_b}
  C 級整新機：NT$ {price_c}
  原錶退回：免費（僅需負擔回寄運費）

請回覆此信件告知您的選擇。

CREST 售後服務團隊
```

實作：在 `ReceivingTab.tsx` 開啟通知 Dialog 時，依該 RMA 的 `warranty_date` 與 `product_model` 自動產生預設文字填入 textarea，admin 仍可編輯。新增「保固內 / 過保固」切換 toggle 供 admin 覆寫（人情保固）。

---

## Phase C — 待客戶確認分頁

### 列表（`AdminLogistics.tsx` + 新 `AwaitingConfirmationTab.tsx`）

- 取代現有「客戶處理」分頁，名稱改為 **「待客戶確認」**
- 只顯示 `status = 'contacting'` 的 RMA
- 每列顯示：RMA 編號、客戶、產品 + 序號、保固狀態徽章、最後通知日期、客戶回覆狀態（已回 / 等待中 / 超過 7 天警示）

### Dialog（點擊列開啟）

**1. 保固判斷區**
- 系統依 `warranty_date >= today` 顯示「保固內」/「已過保」徽章
- Toggle：「以保固內處理 / 以過保處理」（人情保固覆寫）

**2. 客戶往來訊息時間軸**
- 從 `rma_thread_messages` 讀取，依時間顯示 admin 通知 + 客戶回覆 + 附件

**3. 客戶決定區**

依保固狀態顯示對應選項：

**保固內** → 單一動作按鈕：
- ✅ **客戶同意換整新機** → 狀態 `quote_confirmed`、`actual_method = 'warranty_replace'`、`repair_fee = 0`

**過保固** → 4 選 1（顯示該型號 ABC 價格，可覆寫）：
- 🅰️ 購買 A 級整新機（NT$ X,XXX）→ `actual_method = 'purchase_a'`、`repair_fee = A 價`
- 🅱️ 購買 B 級整新機（NT$ X,XXX）→ `actual_method = 'purchase_b'`、`repair_fee = B 價`
- 🅲 購買 C 級整新機（NT$ X,XXX）→ `actual_method = 'purchase_c'`、`repair_fee = C 價`
- ❌ 原錶退回（需填取消原因）→ 狀態 `no_repair`、`actual_method = 'return_original'`

A/B/C 與保固換新最終狀態都是 `quote_confirmed`，後續寄回階段再依 `actual_method` 決定 `shipped_back_new` / `shipped_back_refurbished`。

**4. 自動寫入**
- `rma_repair_details`：upsert `actual_method`、`replacement_model`（A/B/C 級標籤）
- `rma_requests.repair_fee`
- `rma_customer_contacts`：`contact_method = 'decision_logged'`、`contact_notes` = 決定摘要
- `rma_status_history`：狀態變更紀錄

**5. 再次聯繫**
- 「💬 再次發送通知」按鈕導向 RmaReplyTab

---

## 技術細節

### 檔案異動
- 新建：`src/lib/refurbishedPricing.ts`
- 新建：`src/components/logistics/AwaitingConfirmationTab.tsx`
- 修改：`src/pages/AdminLogistics.tsx`（換掉 CustomerHandlingTab）
- 修改：`src/components/logistics/ReceivingTab.tsx`（診斷通知模板動態化 + 保固切換）

### 不需 DB schema 變更
- 沿用現有 `rma_status` enum
- `actual_method` 用字串：`warranty_replace` / `purchase_a` / `purchase_b` / `purchase_c` / `return_original`

### 不在本次範圍
- 寄回作業分頁（下一階段，依 `actual_method` 自動建議寄回類型）
- 付費追蹤、滿意度 follow-up

### 確認後實作順序
1. `refurbishedPricing.ts` 常數檔
2. `ReceivingTab` 通知模板依保固動態切換
3. `AwaitingConfirmationTab` 完整實作 + AdminLogistics 串接
