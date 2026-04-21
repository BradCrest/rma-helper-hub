
## 計畫：讓 Email 知識庫向量索引自動持續跑完

### 問題原因
目前它「不會自己繼續跑」不是資料壞掉，而是架構本來就只會跑一次批次：

- `KnowledgeFileUpload.tsx` 上傳成功後，只呼叫一次 `generate-email-embeddings`
- `generate-email-embeddings/index.ts` 每次只處理 `email_embeddings` 裡最多 `20` 筆 pending
- `EmailEmbeddingManager.tsx` 裡雖然有 `while (true)` 連續處理邏輯，但它只在你按下「立即生成」時才會執行
- 系統目前沒有：
  - 背景排程
  - 自動輪詢
  - pending 狀態變更後自動再觸發
  - realtime 訂閱後自動續跑

所以現在的行為其實是：

```text
上傳檔案
→ 建立很多 pending embeddings
→ 自動呼叫 1 次 generate-email-embeddings
→ 最多處理 20 筆
→ 剩下的 pending 停在那裡
→ 必須手動再按「立即生成」
```

### 要實作的修正方向
採用「前端自動續跑 + 安全批次處理」的方式，先把目前流程補完整，不先引入複雜排程。

### 1. 強化 `EmailEmbeddingManager` 的自動續跑機制
調整 `src/components/admin/EmailEmbeddingManager.tsx`：

- 抽出可重用的 `processPendingEmbeddings()` 方法
- 在以下情境自動啟動：
  - 頁面載入後若發現 `pending > 0`
  - 上傳成功後若新增了新 chunk
  - 手動按下「立即生成」
- 續跑邏輯改成：
  - 呼叫 function
  - refresh status
  - 若仍有 pending，延遲短時間後再呼叫下一輪
  - 直到 `pending === 0`、或本輪沒有新進度、或發生錯誤才停止
- 加上防重入保護，避免同時開兩個循環

### 2. 讓上傳元件能通知索引管理器開始自動跑
調整 `src/components/admin/KnowledgeFileUpload.tsx` 與 `src/pages/AdminEmailKnowledge.tsx`：

- 不再只是在上傳後偷偷 `invoke("generate-email-embeddings")` 一次
- 改成由頁面層統一管理「索引工作已開始」
- 上傳完成後觸發：
  - refresh 知識來源列表
  - refresh embedding 狀態
  - 啟動自動續跑流程
- 避免 upload 元件和 manager 元件各自控制 embedding，造成狀態不同步

建議頁面層資料流：

```text
KnowledgeFileUpload
→ onUploaded({ uploadedCount, chunkCount })
→ AdminEmailKnowledge 接到事件
→ 通知 EmailEmbeddingManager 開始自動處理
→ EmailEmbeddingManager 持續跑到 pending 清空
```

### 3. 補上「有 pending 就自動續跑」而不是只靠按鈕
調整 `EmailEmbeddingManager` 畫面行為：

- 若偵測到 `pending > 0` 且目前沒在處理，直接自動開始
- 卡片文案改清楚，例如：
  - `偵測到 36 筆待索引，系統正在自動處理`
  - `本輪已完成 20 筆，剩餘 16 筆`
- 手動按鈕保留作為備援，但不是主流程
- 若某輪失敗，顯示可重試狀態，而不是讓使用者以為系統還在跑

### 4. 加上停止條件，避免無限循環
避免前端永遠輪詢：

- 若連續一輪或兩輪 `processed === 0` 但 `pending > 0`，停止並顯示錯誤提示
- 若 `failed` 增加，也要停止自動續跑並提示檢查內容
- 若頁面卸載，停止輪詢
- 若使用者離開頁面，不保證背景繼續跑；回到頁面後會再次偵測 pending 並恢復續跑

### 5. 改善 `generate-email-embeddings` 回傳資訊
調整 `supabase/functions/generate-email-embeddings/index.ts`：

- 除了 `processed / failed / total`，再回傳：
  - `remainingPending`
  - `hasMore`
- 讓前端不用只靠重新 query count 才知道要不要下一輪
- 保留每輪最多 20 筆的批次限制，避免單次 function 太久

### 6. UI 文案修正，避免誤解
更新介面說明，讓使用者知道它現在是分批自動處理：

- 上傳成功提示改為：
  - `檔案已加入知識庫，系統正在自動建立索引`
- 索引卡片說明改為：
  - `系統會分批處理 pending 項目，直到全部完成`
- 若頁面重新整理後仍有 pending：
  - 自動恢復處理並提示 `已接續上次未完成的索引工作`

### 7. 第二階段預留：真正背景化
若後續 pending 量變大、PDF 更長、或前端輪詢仍不穩，再升級為背景工作架構：

- 新增 queue table / job table
- 由排程 function 定期處理 pending embeddings
- 前端只顯示 job status，不負責續跑

這不是這次第一優先，先把目前「上傳後不會自己跑完」修好即可。

### 會修改的檔案
- `src/components/admin/EmailEmbeddingManager.tsx`
- `src/components/admin/KnowledgeFileUpload.tsx`
- `src/pages/AdminEmailKnowledge.tsx`
- `supabase/functions/generate-email-embeddings/index.ts`

### 預期結果
完成後流程會變成：

```text
上傳檔案
→ 建立 pending embeddings
→ 自動開始第一輪索引
→ 若還有 pending，自動繼續下一輪
→ 直到全部 completed / failed
→ 使用者不需要一直手動按「立即生成」
```

### 技術摘要
- 根本原因：目前只自動呼叫一次 function，但 function 每次只處理 20 筆
- 現況不是「卡住」，而是「缺少續跑機制」
- 本次用前端自動續跑解決
- 未來如資料量再擴大，再升級成排程/佇列背景處理架構
