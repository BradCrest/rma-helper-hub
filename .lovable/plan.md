## 問題原因

上次的修改把「編輯」按鈕加到了 `src/components/rma/RmaDetailDialog.tsx`，但這個元件其實**沒有被任何頁面引用**。

`/admin/rma-list` 頁面顯示的「RMA 詳細資訊」對話框，是直接寫在 `src/pages/AdminRmaList.tsx` 第 1512 行的內嵌 modal（用 `selectedRma` 狀態控制），所以才看不到編輯按鈕。

## 修改範圍

只修改 `src/pages/AdminRmaList.tsx` 內嵌的詳細對話框（無需動 DB，欄位 `updated_by` / `updated_by_email` 已存在）。

### 1. 新增狀態與表單

在 AdminRmaList 元件中新增：
- `editingDetail` (boolean) — 編輯模式開關
- `savingDetail` (boolean) — 儲存中
- `editForm` — 與下方欄位對應的表單物件
- 從 `useAuth()` 取得 `isAdmin`、`user`

當 `selectedRma` / `selectedRmaShipping` 改變時，把表單值同步初始化。

### 2. 對話框 Header 加上「編輯／儲存／取消」按鈕

第 1517 行的 header：
- 標題 `RMA 詳細資訊` 旁邊（X 按鈕左邊），當 `isAdmin && !editingDetail` 顯示「編輯」按鈕（鉛筆 icon）
- 編輯模式時顯示「儲存」（disable 時顯示「儲存中...」）與「取消」按鈕

### 3. 欄位切換為可編輯

編輯模式下，下列欄位以 `Input` / `Textarea` / `Select` 取代純文字顯示：

| 區塊 | 欄位 |
|---|---|
| 客戶資訊 | 客戶名稱、聯絡電話、電子郵件、客戶地址 |
| 產品資訊 | 產品名稱、產品型號、序號 |
| 問題 | 問題類型（Select：螢幕顯示異常、電池/充電問題、按鍵故障、進水/受潮、外觀損傷、韌體/軟體問題、感測器異常、其他）、問題描述、隨附物品/備註 |
| 客戶寄件資訊 | 物流名稱、物流單號、寄出日期 |

非編輯模式維持原樣顯示。

### 4. 在「建立日期」下方顯示修改資訊

第 1596–1599 行的「建立日期」區塊下方加上：
```
修改日期：{updated_at}
修改人：{updated_by_email}
```
僅當 `updated_at` 不等於 `created_at` 且 `updated_by_email` 存在時才顯示。

### 5. 儲存邏輯

按下「儲存」時：
- 用 `zod` 驗證必填欄位（姓名、電話、Email 格式、產品名稱、問題類型、問題描述）
- 檢查序號是否為無效格式（用既有的 `isInvalidSerialNumber`），若無效則 toast 提示並阻擋
- `supabase.from("rma_requests").update({...欄位, updated_by: user.id, updated_by_email: user.email, updated_at: now}).eq("id", selectedRma.id)`
- 若有寄件資訊變更：
  - 若 `selectedRmaShipping?.id` 存在 → `update` `rma_shipping`
  - 若不存在但有填值 → `insert` 一筆 `direction='inbound'`
- 成功後：toast 提示、退出編輯模式、更新本地 `selectedRma` / `selectedRmaShipping`、重新載入列表 (`fetchRmaList`)

### 6. 清除未使用的元件

`src/components/rma/RmaDetailDialog.tsx` 沒有被引用，但裡面的編輯邏輯這次直接搬到 AdminRmaList，**保留該檔案不刪除**（避免影響 PDF/列印 helper 將來重用）。

## 為什麼不修 RmaDetailDialog.tsx

它沒被引用，所以修它不會產生任何使用者可見效果。要修就必須修使用者實際看到的 inline modal。

## 需要新增 import

在 `AdminRmaList.tsx` 加入：
- `Pencil`, `Save`, `X as XIcon` from `lucide-react`（部分可能已有）
- `Textarea`, `Label`, `Select*` from UI 元件（部分已有）
- `useAuth` from `@/hooks/useAuth`
- `isInvalidSerialNumber`, `INVALID_SERIAL_DESCRIPTION` from `@/lib/serialNumberValidator`
- `z` from `zod`

完成後管理員打開任一筆 RMA 詳細資訊，右上角會出現「編輯」按鈕；點擊後即可修改客戶資料並儲存，並在標題下方看到修改紀錄。