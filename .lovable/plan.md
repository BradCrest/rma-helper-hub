

## 將前端「維修」統一改為「保固服務」

以下列出所有需要修改的地方，**不改動**的項目：狀態標籤（維修中、不維修）、管理後台內部處理方式標籤（維修/換貨/退款）、開始維修按鈕、CSV 欄位註解、供應商維修管理。

---

### 1. `index.html`（1 處）
- 第 10 行：`查詢維修狀態` → `查詢保固服務狀態`

### 2. `src/pages/Index.tsx`（2 處）
- 第 36 行：`暫不支援親送遞交維修件，...影響後續維修進度` → `暫不支援親送遞交保固服務件，...影響後續保固服務進度`
- 第 100 行：`產品維修登記` → `產品保固服務登記`

### 3. `src/pages/RmaConfirmation.tsx`（4 處）
- 第 211 行：`查詢維修狀態` → `查詢保固服務狀態`
- 第 226 行：`查詢維修進度` → `查詢保固服務進度`
- 第 343 行：`查詢維修進度` → `查詢保固服務進度`
- 第 344 行：`維修中心無對外開放` → `保固服務中心無對外開放`

### 4. `src/pages/Track.tsx`（2 處）
- 第 268 行：`查詢維修進度狀態` → `查詢保固服務進度狀態`
- 第 271 行：`查看您的維修進度` → `查看您的保固服務進度`

### 5. `src/pages/Shipping.tsx`（4 處）
- 第 220 行：`查詢您的RMA維修狀態` → `查詢您的RMA保固服務狀態`
- 第 223 行：`查看您的維修進度` → `查看您的保固服務進度`
- 第 414 行：`查詢維修進度` → `查詢保固服務進度`
- 第 415 行：`維修中心無對外開放` → `保固服務中心無對外開放`

### 6. `src/pages/AdminDashboard.tsx`（1 處）
- 第 132 行：`維修追蹤` → `保固服務追蹤`

### 7. `src/components/rma/RmaDetailDialog.tsx`（4 處）
- 第 202、297 行：`RMA 維修服務申請單` → `RMA 保固服務申請單`
- 第 278、337 行：`RMA 維修申請確認單` → `RMA 保固服務申請確認單`

### 8. `src/pages/RmaMultiConfirmation.tsx`（2 處）
- 第 153 行：`RMA 維修申請單` → `RMA 保固服務申請單`
- 第 193 行：`RMA 維修申請確認單` → `RMA 保固服務申請確認單`

---

### 不變動項目（狀態標籤及內部處理）
- `不維修`、`維修中`（Track.tsx、RmaDetailDialog.tsx、CustomerHandlingTab.tsx、RmaMultiConfirmation.tsx、csvParser.ts）
- `維修` 作為處理方式選項（ReceivingTab.tsx、CustomerHandlingTab.tsx）
- `開始維修` 按鈕（CustomerHandlingTab.tsx）
- `供應商維修` / `供應商維修管理`（AdminLogistics.tsx）
- CSV 欄位註解（csvParser.ts）

共修改 **8 個檔案，約 20 處**文字替換。

