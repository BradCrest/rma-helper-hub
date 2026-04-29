## 通知客戶診斷結果功能

### 架構決定
**不新建 `send-diagnosis-email` Edge Function**。改為複用既有的 `send-rma-reply`，理由：

- 自動寫入 `rma_thread_messages`，admin 在「RMA 回覆」分頁看得到完整對話
- 自動產生 30 天 reply token，客戶可用「填寫我的回覆」按鈕回信，回信會自動進系統並標記未讀
- 沿用 `notify.crestdiving.com` 寄件、suppression list、queue retry 等既有基礎設施
- 零新 Edge Function、零新 email 範本、零 migration、零部署風險

### UI 變更（`src/components/logistics/ReceivingTab.tsx`）

1. **位置**：在 Dialog 底部「儲存記錄」按鈕旁，新增第三顆按鈕「📧 通知客戶診斷結果」
   - 條件：僅當 `selectedRma.customer_email` 存在、且**已儲存的** `selectedRma.initial_diagnosis` 非空時啟用
   - 樣式：使用 `variant="secondary"` + `Mail` icon，與既有設計一致

2. **點擊流程**：
   - 開啟 `AlertDialog` 確認框
   - **預覽內容直接從 `selectedRma` 與已載入的 `repairDetail` 讀取已儲存值**，不讀表單 local state（`initialDiagnosis` / `actualMethod` 等 useState）
   - 預覽顯示：收件人 email、主旨、信件正文（純文字呈現），讓 admin 一眼看到實際會寄出的內容
   - 「取消 / 確認寄出」兩顆按鈕

3. **正文組裝（資料來源全部用「已儲存值」）**：
   ```
   您好 {selectedRma.customer_name}，
   
   您的產品 {selectedRma.product_name} {selectedRma.product_model} 已完成初步檢測，結果如下：
   
   【診斷分類】{selectedRma.diagnosis_category || '未分類'}
   【診斷描述】{selectedRma.initial_diagnosis}
   【建議處理方式】{repairDetail.actual_method || repairDetail.planned_method || '待確認'}
   【預估費用】NT$ {repairDetail.estimated_cost ?? '待報價'}
   
   請點擊下方「填寫我的回覆」按鈕確認您是否同意進行此處理方式，
   或回覆任何疑問，我們會儘速為您處理。
   ```
   - 主旨：`[{rma_number}] 產品檢測結果與處理方式確認`

4. **送出後**：
   - 呼叫 `supabase.functions.invoke('send-rma-reply', { body: { rmaRequestId, subject, body, attachments: [] } })`
   - 成功 toast：「已寄出診斷通知給 xxx@xxx」
   - 自動將狀態切換到 `contacting`（呼叫既有 `update-rma-status`）
   - 重新整理列表並關閉 Dialog

5. **重複寄送處理**：每次按按鈕都跳確認 Dialog，不 disable，符合「每次都可重寄」的選擇

### Dirty state 處理（簡化版）

**不偵測表單 dirty state**。理由：

- AlertDialog 預覽內容**只讀已儲存的 `selectedRma` 與 `repairDetail`**，不讀表單 local state
- Admin 在預覽中看到的就是「目前資料庫裡的版本」，自然能判斷是否需要先儲存
- 若 admin 改了表單但沒存，預覽會顯示舊值 → admin 自己會發現並先按「儲存記錄」
- 實作更簡單，零額外 state 追蹤

### 邊界情境處理

- 若已儲存的 `initial_diagnosis` 為空 → 按鈕 disable + tooltip「請先填寫並儲存初步診斷」
- 若 `customer_email` 為空 → 按鈕 disable + tooltip「此 RMA 沒有客戶 Email」
- 寄信失敗 → toast 顯示後端錯誤訊息，狀態不變

### 不會新增的檔案
- ❌ `supabase/functions/send-diagnosis-email/` — 不需要
- ❌ 新 email 範本 — 沿用 `rma-reply.tsx`
- ❌ 任何 DB migration — 全部欄位都已存在

### 唯一變更檔案
- `src/components/logistics/ReceivingTab.tsx`

### 驗證步驟
1. 開啟任一 `inspecting` 狀態的 RMA
2. 填寫並儲存初步診斷（含分類、處理方式、預估費用）
3. 按「通知客戶診斷結果」→ 預覽看到的是已儲存的版本 → 確認寄出
4. 確認 toast 顯示成功、狀態切到「聯繫客戶中」
5. 客戶信箱應收到信，內容包含診斷與「填寫我的回覆」按鈕
6. 在「RMA 回覆」分頁確認該封 outbound 訊息已記錄
7. **驗證 dirty state 行為**：改了表單但不存 → 按通知按鈕 → 預覽顯示的是舊值（未含未存的修改）
