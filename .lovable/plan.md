
## 計畫：改成背景自動索引架構

### 目標
把目前「前端頁面持續呼叫 `generate-email-embeddings`」的模式，改成「後端背景工作自動吃 pending queue」，讓索引能在以下情境持續進行：

- 使用者關掉頁面後仍可繼續
- 網路中斷不會讓整體任務停住
- 上傳新檔案、編輯知識來源後會自動排入背景處理
- 前端只負責顯示狀態，不再負責長時間驅動批次流程

---

### 目前問題
現況是：

- `email_knowledge_sources` 新增/更新後，trigger 只會把 `email_embeddings` 標成 `pending`
- `generate-email-embeddings` 每次只抓 `20` 筆 pending
- 真正「持續下一輪」是靠 `EmailEmbeddingManager.tsx` 的前端 while-loop
- 只要頁面關閉、休眠、網路中斷，索引就會停在中途

所以現在其實不是背景索引，而是「前端代替背景 worker」。

---

### 方案總覽
改成三層結構：

```text
知識來源新增/更新
→ DB trigger 將 embedding 設為 pending
→ 背景 dispatcher 定期喚起索引 worker
→ worker 每輪鎖定一批 pending 並處理
→ 前端只讀取進度與最近執行狀態
```

---

### 1. 新增背景索引工作狀態表
新增一張專用工作表，例如 `email_embedding_jobs`，用途不是存每一筆 embedding，而是存整體背景任務狀態：

建議欄位：
- `id`
- `job_type`（固定為 email_knowledge_embedding）
- `status`（idle / running / retrying / failed）
- `last_started_at`
- `last_finished_at`
- `last_heartbeat_at`
- `last_error`
- `last_processed_count`
- `last_failed_count`
- `trigger_source`（upload / manual / cron / update）
- `updated_at`

用途：
- 避免重複啟動多個 worker
- 讓前端顯示真正背景狀態
- 記錄最近錯誤與最近成功批次

這屬於 schema 變更，會用 migration 建立，並補上 RLS，只允許 admin 讀取。

---

### 2. 新增「喚醒背景工作」函式
新增一個輕量背景函式，例如：
- `kickoff-email-embedding-job`

它的責任不是處理整批 embedding，而是：

- 檢查目前是否已有 job 正在 running
- 若沒有，標記 job 為 running
- 觸發真正的 worker 開始處理
- 若已有 job 在跑，直接回傳「已在背景處理中」

這樣上傳、手動重跑、定時排程都可以統一呼叫這個入口，不會互相打架。

---

### 3. 把 `generate-email-embeddings` 改成真正 worker
目前的 `generate-email-embeddings` 已經有批次處理基礎，但要升級成背景 worker 模式：

#### 會調整的重點
- 不再依賴前端反覆 invoke
- 每次執行時先搶一批 pending，避免重複處理
- 更新 job heartbeat 與批次統計
- 若還有剩餘 pending，可由 dispatcher 在下一個週期再觸發
- 發生錯誤時寫入 job 狀態，而不是只回前端訊息

#### 建議補強
- 在挑選 pending 時加入「processing」中間狀態，避免兩個 worker 同時撿到同一批資料
- 若 worker 中途失敗，可把卡住太久的 `processing` 項目回收成 `pending`
- 回傳結構保留 `processed / failed / remainingPending / hasMore / diagnostics`

---

### 4. 擴充 `email_embeddings` 狀態機
目前只有：
- `pending`
- `completed`
- `failed`

背景化後建議改成：
- `pending`
- `processing`
- `completed`
- `failed`

這樣可以解決背景 worker 併發與重入問題。

另外建議增加：
- `processing_started_at`
- `last_error`
- `attempt_count`

好處：
- 知道哪些筆卡住
- 可以安全重試
- 前端能顯示更明確的失敗原因與重試狀態

這也是 schema 變更，需用 migration。

---

### 5. 加入定時背景排程
建立背景排程，讓系統自動喚醒 worker，例如每 1 分鐘一次：

```text
cron
→ kickoff-email-embedding-job
→ generate-email-embeddings worker
```

用途：
- 即使使用者離開頁面，也會繼續吃 queue
- 若某輪因外部 API 暫時失敗，下個週期仍會再試
- 若新檔案剛上傳，最晚下一個排程週期就會接手

若上傳或手動操作時有主動 kickoff，排程則作為保險；兩者可並存。

---

### 6. 上傳與編輯流程改成「排入背景」，不自己跑迴圈
調整以下前端與函式責任：

#### `src/components/admin/KnowledgeFileUpload.tsx`
- 保留上傳檔案與成功提示
- 上傳完成後不再自己等待索引完成
- 改成呼叫背景 kickoff
- 文案改成：
  - `檔案已加入知識庫，背景索引已排程`

#### `src/pages/AdminEmailKnowledge.tsx`
- 新增/編輯知識來源後也呼叫 kickoff
- 保留 refresh list
- 移除「靠 signal 觸發前端無限續跑」的核心依賴

---

### 7. `EmailEmbeddingManager` 改成監控面板，不再當 worker
調整 `src/components/admin/EmailEmbeddingManager.tsx`：

#### 移除
- 前端 `while` 續跑主邏輯
- 長時間 retry/backoff 作為主要索引手段

#### 改成
- 定時讀取：
  - `email_embeddings` 統計
  - `email_embedding_jobs` 最新狀態
- 顯示：
  - 總筆數 / completed / pending / processing / failed
  - 背景工作狀態（閒置 / 執行中 / 重試中 / 失敗）
  - 最近一次啟動時間
  - 最近一次成功批次
  - 最近錯誤訊息
- 手動按鈕改成：
  - `立即喚醒背景索引`
  - 它只呼叫 kickoff，不直接自己跑完整批次

---

### 8. 補上卡住資料的回收策略
背景架構一定要處理「worker 執行到一半斷掉」：

#### 建議規則
- 若某筆 `processing` 超過一定時間仍未完成，例如 15 分鐘
- 下一輪 worker 啟動時，自動把它回收成 `pending`
- `attempt_count + 1`
- 超過最大嘗試次數後才改成 `failed`

這樣可以避免永遠卡在 processing。

---

### 9. 保留搜尋與 RAG 相容性
現有 `search_email_embeddings` 只讀：
- `embedding IS NOT NULL`
- `status = 'completed'`

這個邏輯可以保留，不需改搜尋介面。
背景化後只要確保：
- 未完成的資料不被檢索
- completed 的資料持續可用

因此 chat/RAG 端影響很小。

---

### 10. 會修改的檔案
前端：
- `src/components/admin/EmailEmbeddingManager.tsx`
- `src/components/admin/KnowledgeFileUpload.tsx`
- `src/pages/AdminEmailKnowledge.tsx`

後端函式：
- `supabase/functions/generate-email-embeddings/index.ts`
- 新增背景 kickoff 函式（例如 `supabase/functions/kickoff-email-embedding-job/index.ts`）

資料庫：
- `supabase/migrations/...`  
  用於新增：
  - `email_embedding_jobs`
  - `email_embeddings` 新欄位/新狀態
  - 需要的索引、RLS、輔助函式

排程：
- 新增 cron 呼叫背景 kickoff/worker

---

### 11. 預期完成後的流程
```text
上傳檔案 / 編輯知識來源
→ trigger 將對應 embedding 標成 pending
→ kickoff 背景工作
→ worker 批次處理 pending
→ cron 持續保底喚醒
→ 前端只顯示狀態，不再負責續跑
```

---

### 技術摘要
- 核心改動：從「前端輪詢驅動」改成「後端背景 worker + 排程」
- 必要結構：job table、processing 狀態、stale recovery、kickoff function、cron
- 前端會更穩定：只做監控與手動喚醒，不再長時間持有索引流程
- 對大量 backlog 更安全，也比較適合之後擴充成真正 queue 架構
