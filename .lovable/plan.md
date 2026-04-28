## 背景

目前 Email 藍色按鈕導向 `/shipping?rma=...&autoopen=1`，依賴前端 React 的 `useEffect` 彈出 Modal 並自動搜尋。實際運作時，自動開啟未觸發（疑似為發布版本快取或前端時序問題），使用者仍需手動點按。

## 解決方案

新增一個 **Email 專用的單一填寫頁面**：`/shipping-form?rma=RC...`

此頁面流程簡單直接：
1. 進入頁面時自動以 URL 中的 RMA 編號透過 `lookup-rma` 查詢，並直接顯示 RMA 摘要（RMA 編號、產品名稱、狀態）。
2. 頁面**直接渲染寄件資訊表單**（物流名稱、物流單號、選填照片）— 沒有 Modal、沒有 Tab、沒有額外按鈕。
3. 送出後呼叫 `submit-shipping` Edge Function 寫入資料庫，狀態自動轉為 `shipped`。
4. 成功後顯示確認畫面（含 RMA 編號、感謝訊息、回首頁按鈕）。
5. 若 RMA 已寄出 / 找不到 / 狀態不允許 → 顯示對應錯誤畫面，提供回首頁連結。

不會動到既有 `/shipping` 頁面與 `/track` 流程，現有 Modal 行為保留供其他入口使用。

## 變更內容

### 1. 新增 `src/pages/ShippingForm.tsx`
- 路徑：`/shipping-form`
- 從 URL `?rma=` 讀取 RMA 編號（無編號則顯示錯誤）
- 載入時自動呼叫 `lookup-rma` Edge Function
- 三種畫面狀態：
  - **載入中**：顯示 spinner
  - **填寫中**：顯示 RMA 摘要卡 + 寄件資訊表單（物流名稱、單號、照片上傳、寄件須知與不可親送提醒）
  - **完成**：成功訊息 + RMA 編號 + 回首頁
  - **錯誤**：找不到 RMA / 已寄出 / 狀態不符 → 友善錯誤畫面
- 沿用現有 `rma-card` / `rma-input` / `rma-btn-primary` 樣式，視覺一致
- 照片上傳：5MB 上限，上傳到 `rma-photos` bucket
- 提交：呼叫 `submit-shipping`（沿用現有 Edge Function，不需修改）

### 2. 註冊路由 `src/App.tsx`
- 新增 `<Route path="/shipping-form" element={<ShippingForm />} />`

### 3. 更新 Email 模板 `supabase/functions/_shared/transactional-email-templates/shipping-reminder.tsx`
- 將按鈕 `shippingUrl` 預設值與 `previewData` 改為指向 `/shipping-form?rma=...`
- 移除 `&autoopen=1` 參數（不再需要）

### 4. 更新 `supabase/functions/send-shipping-reminders/index.ts`
- 將寄送提醒 email 時組裝的 `shippingUrl` 從 `/shipping?rma=X&autoopen=1` 改為 `/shipping-form?rma=X`

### 5. 部署與測試
- 部署 `send-shipping-reminders` 與 `send-transactional-email`（後者吃模板）
- 重寄一次測試信到 `RC7EA057459`，驗證點擊藍色按鈕後直接看到填寫表單

## 不變更項目

- `submit-shipping` Edge Function 邏輯（已支援 customer 直送、會自動更新狀態為 `shipped`、發 Slack 通知）
- 現有 `/shipping` 頁面（Tab 切換 + Modal 流程保留給直接從首頁進入的使用者）
- 資料庫 schema、RLS 政策

## 風險與緩解

- **使用者誤把舊連結傳給其他人**：舊 `/shipping?rma=...&autoopen=1` 依然可運作（只是回到 Modal 流程），不會 404。
- **重複提交**：`submit-shipping` 已檢查 `existingShipping` 與 `status='registered'`，重送會回 400 並顯示「此 RMA 已有寄件資訊」。
