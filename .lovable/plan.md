## 目標

當客戶在「產品序號」欄位填入下列**非產品序號**的代碼時，攔截並彈出提醒，告知正確的序號位置：

- `EN` 開頭（例：EN13319）
- 包含 `13319`
- `EN13319`
- `CCA` 開頭的 NCC 核准號（例：CCAB12LP1234T5）

## 偵測規則（不分大小寫、忽略空白與連字號）

正規化方式：`value.toUpperCase().replace(/[\s\-]/g, '')`

判斷為**無效序號**的條件（任一成立）：
1. 以 `EN` 開頭
2. 字串中包含 `13319`
3. 以 `CCA` 開頭（NCC 核准號格式）

## 提示訊息（彈窗 / Toast）

標題：**這不是產品序號**

內容：
> 您輸入的看起來是 **歐盟潛水標準（EN13319）** 或 **NCC 核准號（CCA 開頭）**，並非產品序號。
>
> ✅ 產品序號可在以下位置找到：
> - **產品包裝盒**上的標籤
> - **錶身背面**的刻印
>
> 請重新確認後再填寫，謝謝。

## 觸發時機

採用「**onBlur 即時驗證 + 送出再次攔截**」雙保險：

1. **onBlur**：使用者離開序號欄位時，若符合無效規則 → 跳 AlertDialog（彈窗，需按確認），並清空欄位讓他重填
2. **送出時**：再次檢查，若仍無效 → toast.error 並中止送出

彈窗比 toast 更有阻擋力，能確保使用者真的看到（toast 容易被忽略）。

## 修改範圍

### 1. 新增共用驗證 helper
新檔：`src/lib/serialNumberValidator.ts`
- `isInvalidSerialNumber(value: string): boolean`
- `INVALID_SERIAL_MESSAGE` 常數（彈窗文字）

### 2. `src/components/rma/RmaForm.tsx`（單筆模式）
- 在序號 `<input>` 加 `onBlur` 驗證
- 在 `handleSubmit` 內加最終攔截
- 新增 AlertDialog state 顯示提示

### 3. `src/components/rma/MultiProductForm.tsx`（多筆模式）
- 序號欄位加 `onBlur` 驗證
- 觸發父層共用的 AlertDialog（透過 prop 或 sonner toast 升級版）

### 4. `src/components/rma/CsvImportSection.tsx` / `rmaMultiCsvParser.ts`（CSV 匯入）
- 在解析時若偵測到無效序號 → 加入 `errors` 陣列，附帶說明 「第 N 列序號疑似 EN13319/NCC 號，請檢查」
- 不擋下匯入流程，但於 preview 警示

### 5. （可選）後端 `supabase/functions/submit-rma/index.ts`
- 加同樣的伺服器端檢查作為最後防線，回傳 400

## 不修改的部分

- 後台 `AdminRmaList` 等顯示頁面不動（避免影響歷史資料）
- 已存在資料庫的舊紀錄不回溯處理

## UI 範例

```text
┌─────────────────────────────────┐
│  ⚠️  這不是產品序號              │
├─────────────────────────────────┤
│  您輸入的看起來是 EN13319 標準   │
│  或 NCC 核准號，並非產品序號。   │
│                                  │
│  產品序號可在以下位置找到：      │
│  • 產品包裝盒上的標籤            │
│  • 錶身背面的刻印                │
│                                  │
│              [ 我知道了 ]        │
└─────────────────────────────────┘
```
