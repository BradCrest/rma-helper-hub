## 計畫：RMA 詳細資訊頁加入「管理員編輯」功能

讓管理員可在 RMA 詳細對話框中直接修正客戶填寫錯誤的欄位，並記錄修改時間與修改人。

---

### 1. 資料庫 Schema 變更（migration）

`rma_requests` 新增一欄追蹤最後修改人：

```sql
ALTER TABLE public.rma_requests
  ADD COLUMN updated_by uuid REFERENCES auth.users(id);
```

（`updated_at` 已存在，會由 application code 在儲存時一併更新。）

不另外建 trigger，避免影響現有寫入路徑——由前端送出更新時明確帶上 `updated_by = auth.uid()` 與 `updated_at = now()`。

> 註：`rma_shipping` 已有 `updated_at`；不另加 `updated_by`，視為次要編輯歷程。

---

### 2. 前端：`src/components/rma/RmaDetailDialog.tsx`

#### A. 新增「編輯模式」切換

- 右上角放一個 **「編輯」** 按鈕（僅管理員可見；用 `useAuth` 判斷 `isAdmin`）。
- 進入編輯模式後，所有可編輯欄位變成 `Input` / `Textarea`；底部按鈕切換為 **「取消 / 儲存」**。

#### B. 可編輯欄位（依需求）

| 區塊 | 欄位（資料庫欄位） |
|---|---|
| 客戶資訊 | `customer_name`、`customer_phone`、`mobile_phone`、`customer_email`、`customer_address` |
| 產品資訊 | `product_name`、`product_model`、`serial_number` |
| 問題 | `issue_type`（Select：與表單同選項）、`issue_description`（Textarea） |
| 備註 | `customer_notes`（Textarea，標題「隨附物品 / 備註」）|
| 客戶寄件資訊 | `rma_shipping`（direction='inbound'）：`carrier`、`tracking_number`、`ship_date`、`notes` |

> `RmaData` interface 補上 `id`、`updated_at`、`updated_by`、以及內嵌 `inbound_shipping` 物件。

#### C. 儲存流程

1. **驗證**：用 `zod` schema 檢查 email 格式、必填、長度上限（name 100、address 500、description 2000…）。也套用 `serialNumberValidator.ts` 阻擋 EN/CCA/13319。
2. **更新 rma_requests**：
   ```ts
   await supabase.from("rma_requests").update({
     customer_name, customer_phone, mobile_phone, customer_email, customer_address,
     product_name, product_model, serial_number,
     issue_type, issue_description, customer_notes,
     updated_by: user.id,
     updated_at: new Date().toISOString(),
   }).eq("id", rmaData.id);
   ```
3. **更新 rma_shipping (inbound)**：若該筆已存在則 `update`、否則 `insert`（with `direction='inbound'`）。
4. 成功後 `toast.success`、重新呼叫 `fetchRmaData()` 顯示最新資料、退出編輯模式。
5. 失敗時顯示 `toast.error` 並保留編輯內容。

#### D. 顯示「修改資訊」

在 RMA 編號區塊「申請時間」下方加一行：

```
申請時間：2026/04/12 10:23
修改時間：2026/04/28 15:40 ｜ 修改人：admin@crest.com
```

- 若 `updated_at === created_at` 或無 `updated_by`，則不顯示該行。
- 修改人 email：透過已存在的 `lookup-user` Edge Function（依 `updated_by` user_id 查詢）取得 email；查不到時顯示「(已移除帳號)」。

#### E. 取得管理員身份

使用 `useAuth()` 與 `is_admin` 判斷；非管理員不顯示「編輯」按鈕（雙重保險：RLS 已限制 UPDATE 給 admin）。

---

### 3. Edge Function `lookup-rma`

擴充 `full_details=true` 的回傳：
- 加入 `id`、`updated_at`、`updated_by`
- 加入 `inbound_shipping`：從 `rma_shipping` 取 `direction='inbound'` 的最新一筆（`carrier`, `tracking_number`, `ship_date`, `notes`）

---

### 4. 不變更

- 不影響客戶端追蹤頁（`Track.tsx`）的 masked 流程
- PDF / 列印模板維持既有版面（會自動使用最新資料）
- 不改寫 `submit-rma`、不影響表單驗證流程

---

### 技術備註

- 編輯後因 `rma_requests` 更新會觸發 `mark_embedding_pending`，向量資料會自動重新生成 ✅ 不需額外處理
- Slack 通知 trigger 是基於狀態變更，編輯欄位不會誤發通知 ✅
- `rma_status_history` 也只在狀態變更時寫入，編輯欄位不影響 ✅

確認後即實作。